"""Envoi d'e-mails de rappel via l'API Gmail.

Utilise un refresh_token pour obtenir un access_token à la volée, puis appelle
l'endpoint messages/send de Gmail. Le refresh token est stocké de façon
persistante par reminder_storage.
"""

from __future__ import annotations

import base64
import logging
from datetime import datetime, timezone
from email.mime.text import MIMEText
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from app.config import settings
from app.services import reminder_storage

log = logging.getLogger(__name__)

# Must match the scopes used during the OAuth consent flow in reminders.py.
_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/userinfo.email",
]

_MONTHS_FR = [
    "", "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]


def _format_event_date(utc_iso: str, tz_name: str = "") -> str:
    """Convertit une date UTC ISO en « 18 août 2026 à 16h30 » dans le fuseau local."""
    dt = datetime.fromisoformat(utc_iso.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)

    # Convertir vers le fuseau de l'utilisateur.
    if tz_name:
        try:
            dt = dt.astimezone(ZoneInfo(tz_name))
        except (ZoneInfoNotFoundError, KeyError):
            dt = dt.astimezone(timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)

    return f"{dt.day} {_MONTHS_FR[dt.month]} {dt.year} à {dt.hour:02d}h{dt.minute:02d}"


def _build_credentials(user_id: str) -> Credentials | None:
    """Construit un objet Credentials à partir du refresh token stocké.

    Le refresh token OAuth2 exige client_id et client_secret pour être échangé.
    """
    tokens = reminder_storage.get_tokens(user_id)
    if not tokens:
        return None
    creds = Credentials(
        token=None,
        refresh_token=tokens["refresh_token"],
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        scopes=_SCOPES,
    )
    return creds


def _get_service(user_id: str):
    """Renvoie un objet Gmail API service, token rafraîchi si nécessaire."""
    creds = _build_credentials(user_id)
    if not creds:
        return None
    if not creds.valid:
        creds.refresh(Request())
    return build("gmail", "v1", credentials=creds)


def send_reminder_email(
    user_id: str,
    to_email: str,
    event_title: str,
    event_start: str,
    event_end: str,
    reminder_label: str,
) -> bool:
    """Envoie un e-mail de rappel. Renvoie True si l'envoi a réussi."""
    try:
        service = _get_service(user_id)
        if not service:
            log.warning("Pas de token pour l'utilisateur %s, rappel ignoré.", user_id)
            return False

        tokens = reminder_storage.get_tokens(user_id) or {}
        tz_name = tokens.get("timezone", "")
        formatted_start = _format_event_date(event_start, tz_name)

        subject = f"Rappel KAIROS : {event_title}"
        body = (
            f"Bonjour,\n\n"
            f"Ceci est un rappel pour votre événement :\n\n"
            f"  {event_title}\n"
            f"  Début : {formatted_start}\n"
        )

        if event_end:
            formatted_end = _format_event_date(event_end, tz_name)
            body += f"  Fin : {formatted_end}\n"

        body += (
            f"\nRappel activé {reminder_label}.\n\n"
            f"— KAIROS"
        )

        message = MIMEText(body)
        message["to"] = to_email
        message["subject"] = subject

        raw = base64.urlsafe_b64encode(message.as_bytes()).decode("ascii")
        service.users().messages().send(
            userId="me",
            body={"raw": raw},
        ).execute()

        log.info("Rappel envoyé à %s : %s", to_email, event_title)
        return True

    except Exception:
        log.exception("Échec de l'envoi du rappel pour %s", event_title)
        return False


def send_weekly_summary_email(
    user_id: str,
    to_email: str,
    events: list[dict],
    tz_name: str = "",
) -> bool:
    """Envoie le résumé hebdomadaire des événements à venir. Renvoie True si l'envoi a réussi."""
    try:
        service = _get_service(user_id)
        if not service:
            log.warning("Pas de token pour l'utilisateur %s, résumé hebdomadaire ignoré.", user_id)
            return False

        events_tries = sorted(events, key=lambda e: e.get("start", ""))

        subject = "Votre résumé de la semaine — KAIROS"
        if not events_tries:
            body = (
                "Bonjour,\n\n"
                "Aucun événement n'est prévu dans votre agenda pour les 7 prochains jours.\n\n"
                "— KAIROS"
            )
        else:
            lignes = "\n".join(
                f"  • {event.get('title') or '(sans titre)'} — {_format_event_date(event.get('start', ''), tz_name)}"
                for event in events_tries
            )
            body = (
                f"Bonjour,\n\n"
                f"Voici votre résumé pour les 7 prochains jours "
                f"({len(events_tries)} événement(s)) :\n\n"
                f"{lignes}\n\n"
                f"— KAIROS"
            )

        message = MIMEText(body)
        message["to"] = to_email
        message["subject"] = subject

        raw = base64.urlsafe_b64encode(message.as_bytes()).decode("ascii")
        service.users().messages().send(
            userId="me",
            body={"raw": raw},
        ).execute()

        log.info("Résumé hebdomadaire envoyé à %s (%d événement(s))", to_email, len(events_tries))
        return True

    except Exception:
        log.exception("Échec de l'envoi du résumé hebdomadaire pour l'utilisateur %s", user_id)
        return False
