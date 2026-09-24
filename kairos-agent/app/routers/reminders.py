"""Routes des rappels e-mail.

- GET  /api/reminders/auth-url            → génère l'URL de consentement Google
- GET  /api/reminders/callback            → reçoit le code d'autorisation, échange contre des tokens
- POST /api/reminders/sync                → synchronise les événements (appelé à chaque changement)
- POST /api/reminders/cancel              → annule les rappels d'un événement
- GET  /api/reminders/status              → état des rappels pour l'utilisateur
- POST /api/reminders/weekly-summary-prefs → choix du jour du résumé hebdomadaire
"""

from __future__ import annotations

import logging
import secrets
import time
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from google_auth_oauthlib.flow import Flow

from app.config import settings
from app.services import reminder_storage

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/reminders", tags=["reminders"])

_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/userinfo.email",
]

# ── PKCE state store ────────────────────────────────────────────────────────
# Maps a random OAuth state string → (code_verifier, user_id, created_at).
# Entries expire after 10 minutes. Accessed only from async uvicorn threads;
# a plain dict is fine because FastAPI runs one request at a time per worker.
_oauth_states: dict[str, tuple[str, str, float]] = {}
_STATE_TTL = 600  # seconds


def _store_oauth_state(code_verifier: str, user_id: str) -> str:
    """Persist the PKCE verifier and userId under a random state. Returns the state."""
    _purge_expired_states()
    state = secrets.token_urlsafe(32)
    _oauth_states[state] = (code_verifier, user_id, time.time())
    return state


def _pop_oauth_state(state: str) -> tuple[str, str]:
    """Retrieve and delete the PKCE verifier + userId for *state*.

    Returns (code_verifier, user_id).
    Raises HTTPException 400 if the state is unknown or expired.
    """
    _purge_expired_states()
    entry = _oauth_states.pop(state, None)
    if entry is None:
        raise HTTPException(
            status_code=400,
            detail="Session OAuth expirée ou introuvable. Réessayez.",
        )
    return entry[0], entry[1]


def _purge_expired_states() -> None:
    now = time.time()
    expired = [s for s, (*_, ts) in _oauth_states.items() if now - ts > _STATE_TTL]
    for s in expired:
        del _oauth_states[s]

# ── Schémas ─────────────────────────────────────────────────────────────────


class SyncEventRequest(BaseModel):
    eventId: str
    title: str
    start: str
    end: str = ""
    userId: str
    enabled: bool = True


class CancelRequest(BaseModel):
    eventId: str
    userId: str


class WeeklySummaryPrefsRequest(BaseModel):
    userId: str
    enabled: bool
    day: str  # "monday".."sunday", voir reminder_storage.WEEKDAYS


class AuthUrlResponse(BaseModel):
    url: str


# ── Routes ──────────────────────────────────────────────────────────────────


@router.get("/auth-url", response_model=AuthUrlResponse)
def auth_url(userId: str) -> AuthUrlResponse:
    """Génère l'URL de consentement Google OAuth2 pour l'envoi de rappels."""
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=503,
            detail="Google OAuth2 n'est pas configuré côté serveur. "
                   "Renseignez GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET dans .env.",
        )

    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        scopes=_SCOPES,
        redirect_uri=settings.google_redirect_uri,
    )

    # Génère le code_verifier PKCE en interne.
    auth_url_str, _ = flow.authorization_url(
        access_type="offline",
        prompt="consent",
    )

    # Stocker le code_verifier sous un state aléatoire sécurisé.
    state = _store_oauth_state(flow.code_verifier, userId)

    # Remplacer le state généré dans l'URL par notre state sécurisé.
    parsed = urlparse(auth_url_str)
    params = parse_qs(parsed.query, keep_blank_values=True)
    params["state"] = [state]
    flat_params = {k: v[0] for k, v in params.items()}
    new_query = urlencode(flat_params)
    auth_url_str = urlunparse(parsed._replace(query=new_query))

    return AuthUrlResponse(url=auth_url_str)


@router.get("/callback")
def auth_callback(code: str, state: str = "") -> dict:
    """Échange le code d'autorisation contre des tokens et stocke le refresh token."""
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(status_code=503, detail="OAuth2 non configuré.")

    if not state:
        raise HTTPException(status_code=400, detail="State OAuth manquant.")

    code_verifier, user_id = _pop_oauth_state(state)

    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        scopes=_SCOPES,
        redirect_uri=settings.google_redirect_uri,
    )
    flow.code_verifier = code_verifier

    flow.fetch_token(code=code)
    creds = flow.credentials

    if not creds.refresh_token:
        raise HTTPException(
            status_code=400,
            detail="Google n'a pas renvoyé de refresh token. "
                   "Réessayez en supprimant l'accès depuis myaccount.google.com.",
        )

    # Récupérer l'adresse e-mail
    import httpx
    resp = httpx.get(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        headers={"Authorization": f"Bearer {creds.token}"},
    )
    email = resp.json().get("email", "")

    reminder_storage.save_tokens(user_id, creds.refresh_token, email)

    return {"status": "ok", "email": email}


class SyncBatchRequest(BaseModel):
    events: list[SyncEventRequest]
    timezone: str = ""


@router.post("/sync")
def sync_events(payload: SyncBatchRequest) -> dict:
    """Synchronise les rappels pour une liste d'événements.

    Crée les rappels pour les événements à venir, les met à jour si modifiés,
    et supprime ceux des événements absents de la liste.
    """
    enabled_events = [e for e in payload.events if e.enabled]
    enabled_ids = {e.eventId for e in enabled_events}

    # Stocker le fuseau horaire de l'utilisateur si fourni.
    if payload.timezone and enabled_events:
        uid = enabled_events[0].userId
        tokens = reminder_storage.get_tokens(uid)
        if tokens:
            tokens["timezone"] = payload.timezone
            reminder_storage.save_tokens(uid, tokens["refresh_token"], tokens["email"], payload.timezone)

    # Mettre à jour les rappels pour chaque événement
    for event in enabled_events:
        # Vérifier que l'utilisateur a un token
        tokens = reminder_storage.get_tokens(event.userId)
        if not tokens:
            continue

        reminder_storage.reschedule_event_reminders(
            event_id=event.eventId,
            event_title=event.title,
            event_start=event.start,
            event_end=event.end,
            user_id=event.userId,
        )

    # Conserver un instantané des événements à venir par utilisateur : c'est la
    # seule donnée dont le résumé hebdomadaire dispose, le serveur n'ayant pas
    # d'accès direct à Google Calendar (voir reminder_storage.py).
    par_utilisateur: dict[str, list[dict]] = {}
    for event in enabled_events:
        par_utilisateur.setdefault(event.userId, []).append(
            {"title": event.title, "start": event.start, "end": event.end}
        )
    for uid, events in par_utilisateur.items():
        reminder_storage.save_upcoming_events_snapshot(uid, events)

    return {"status": "ok", "scheduled": len(enabled_events)}


@router.post("/cancel")
def cancel_reminders(payload: CancelRequest) -> dict:
    """Annule tous les rappels d'un événement (appelé lors de la suppression)."""
    reminder_storage.cancel_reminders_for_event(payload.eventId)
    return {"status": "ok"}


@router.post("/weekly-summary-prefs")
def set_weekly_summary_prefs(payload: WeeklySummaryPrefsRequest) -> dict:
    """Active/désactive le résumé hebdomadaire et fixe le jour d'envoi choisi."""
    if payload.day not in reminder_storage.WEEKDAYS:
        raise HTTPException(status_code=422, detail="Jour de la semaine invalide.")
    reminder_storage.set_weekly_summary_prefs(payload.userId, payload.enabled, payload.day)
    return {"status": "ok"}


@router.get("/status")
def reminder_status(userId: str) -> dict:
    """Renvoie les rappels planifiés pour un utilisateur."""
    tokens = reminder_storage.get_tokens(userId)
    if not tokens:
        return {"connected": False, "reminders": {}}

    all_reminders = reminder_storage.get_all_reminders()
    user_reminders = {
        k: v for k, v in all_reminders.items() if v.get("user_id") == userId
    }
    weekly = reminder_storage.get_weekly_summary_prefs(userId) or {}

    return {
        "connected": True,
        "email": tokens.get("email", ""),
        "reminders": user_reminders,
        "weeklySummaryEnabled": weekly.get("enabled", False),
        "weeklySummaryDay": weekly.get("day"),
    }
