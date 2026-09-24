"""Stockage persistant des tokens OAuth2 et des rappels planifiés.

Tout est écrit dans un fichier JSON unique, simpler à maintenir qu'une base
de données pour un usage mono-utilisateur. Lecture/écriture avec verrou pour
éviter les courses d'écriture entre le scheduler et les routes.
"""

from __future__ import annotations

import json
import logging
import threading
from datetime import datetime, timedelta
from pathlib import Path
from typing import Literal

_STORAGE_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "reminders.json"
_lock = threading.Lock()
log = logging.getLogger(__name__)

# ── Modèles de données ──────────────────────────────────────────────────────

ReminderKind = Literal["1d", "1h", "30m"]

_MAX_RETRIES = 3

KIND_LABELS: dict[ReminderKind, str] = {
    "1d": "1 jour avant",
    "1h": "1 heure avant",
    "30m": "30 minutes avant",
}

KIND_DELTAS: dict[ReminderKind, int] = {
    "1d": 86400,
    "1h": 3600,
    "30m": 1800,
}


def _empty_store() -> dict:
    return {
        "tokens": {},      # user_id → { refresh_token, email }
        "reminders": {},   # "event_id:kind" → { event_id, kind, event_title, event_start, user_id, fire_at, sent }
        "weekly_summaries": {},  # user_id → { enabled, day, last_sent_date, events_snapshot }
    }


def _load() -> dict:
    if _STORAGE_PATH.exists():
        try:
            data = json.loads(_STORAGE_PATH.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return _empty_store()
        # Fichiers écrits avant l'ajout du résumé hebdomadaire : compléter.
        data.setdefault("tokens", {})
        data.setdefault("reminders", {})
        data.setdefault("weekly_summaries", {})
        return data
    return _empty_store()


def _save(data: dict) -> None:
    _STORAGE_PATH.parent.mkdir(parents=True, exist_ok=True)
    _STORAGE_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


# ── Tokens ──────────────────────────────────────────────────────────────────

def save_tokens(user_id: str, refresh_token: str, email: str, timezone: str = "") -> None:
    with _lock:
        data = _load()
        data["tokens"][user_id] = {
            "refresh_token": refresh_token,
            "email": email,
            "timezone": timezone,
        }
        _save(data)


def get_tokens(user_id: str) -> dict | None:
    with _lock:
        return _load()["tokens"].get(user_id)


def get_all_tokens() -> dict[str, dict]:
    with _lock:
        return dict(_load()["tokens"])


def remove_tokens(user_id: str) -> None:
    with _lock:
        data = _load()
        data["tokens"].pop(user_id, None)
        _save(data)


# ── Rappels ─────────────────────────────────────────────────────────────────

def _reminder_key(event_id: str, kind: ReminderKind) -> str:
    return f"{event_id}:{kind}"


def schedule_reminder(
    event_id: str,
    kind: ReminderKind,
    event_title: str,
    event_start: str,
    user_id: str,
    event_end: str = "",
) -> None:
    """Planifie un rappel. S'il existe déjà et n'est pas envoyé, le met à jour."""
    fire_at = (
        datetime.fromisoformat(event_start.replace("Z", "+00:00"))
        - timedelta(seconds=KIND_DELTAS[kind])
    ).isoformat()

    key = _reminder_key(event_id, kind)
    with _lock:
        data = _load()
        existing = data["reminders"].get(key)
        if existing and existing.get("sent"):
            return  # déjà envoyé, ne pas reprogrammer
        data["reminders"][key] = {
            "event_id": event_id,
            "kind": kind,
            "event_title": event_title,
            "event_start": event_start,
            "event_end": event_end,
            "user_id": user_id,
            "fire_at": fire_at,
            "sent": False,
            "failures": 0,
        }
        _save(data)


def cancel_reminders_for_event(event_id: str) -> None:
    """Supprime tous les rappels d'un événement (suppression ou mise à jour)."""
    prefix = f"{event_id}:"
    with _lock:
        data = _load()
        keys_to_remove = [k for k in data["reminders"] if k.startswith(prefix)]
        for k in keys_to_remove:
            del data["reminders"][k]
        _save(data)


def get_pending_reminders() -> list[dict]:
    """Renvoie les rappels dont l'heure d'envoi est passée et qui n'ont pas encore été envoyés.

    Ignore les rappels dont le nombre de tentatives a atteint _MAX_RETRIES.
    """
    now = datetime.now().astimezone()
    with _lock:
        data = _load()
        pending = []
        for entry in data["reminders"].values():
            if entry.get("sent"):
                continue
            if entry.get("failures", 0) >= _MAX_RETRIES:
                continue
            try:
                fire_at = datetime.fromisoformat(entry["fire_at"])
                if fire_at <= now:
                    pending.append(entry)
            except (ValueError, KeyError):
                continue
        return pending


def mark_sent(event_id: str, kind: ReminderKind) -> None:
    key = _reminder_key(event_id, kind)
    with _lock:
        data = _load()
        if key in data["reminders"]:
            data["reminders"][key]["sent"] = True
            data["reminders"][key]["failures"] = 0
            _save(data)


def mark_failed(event_id: str, kind: ReminderKind) -> None:
    """Incrémente le compteur d'échecs. Après _MAX_RETRIES, le rappel est abandonné."""
    key = _reminder_key(event_id, kind)
    with _lock:
        data = _load()
        if key in data["reminders"]:
            entry = data["reminders"][key]
            entry["failures"] = entry.get("failures", 0) + 1
            if entry["failures"] >= _MAX_RETRIES:
                log.warning(
                    "Rappel abandonné après %d tentatives : %s",
                    _MAX_RETRIES,
                    entry.get("event_title", key),
                )
            _save(data)


def get_all_reminders() -> dict:
    with _lock:
        return _load()["reminders"]


def reschedule_event_reminders(
    event_id: str,
    event_title: str,
    event_start: str,
    user_id: str,
    event_end: str = "",
    kinds: list[ReminderKind] | None = None,
) -> None:
    """Annule les anciens rappels d'un événement et les recrée avec les nouvelles données."""
    if kinds is None:
        kinds = ["1d", "1h", "30m"]
    cancel_reminders_for_event(event_id)
    for kind in kinds:
        schedule_reminder(event_id, kind, event_title, event_start, user_id, event_end=event_end)


# ── Résumé hebdomadaire ──────────────────────────────────────────────────────
#
# Fonctionnalité additionnelle, indépendante des rappels 1j/1h/30min ci-dessus :
# un e-mail récapitulatif envoyé une fois par semaine, le jour choisi par
# l'utilisateur. Le serveur n'a pas d'accès direct à Google Calendar (le jeton
# de lecture du calendrier vit dans le navigateur) : `save_upcoming_events_snapshot`
# conserve donc la dernière liste d'événements connue, transmise par le
# front-end à chaque appel de /api/reminders/sync, pour pouvoir composer ce
# résumé même si l'utilisateur n'a pas le navigateur ouvert au moment de l'envoi.

WEEKDAYS: list[str] = [
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
]

WEEKDAY_LABELS: dict[str, str] = {
    "monday": "lundi",
    "tuesday": "mardi",
    "wednesday": "mercredi",
    "thursday": "jeudi",
    "friday": "vendredi",
    "saturday": "samedi",
    "sunday": "dimanche",
}


def set_weekly_summary_prefs(user_id: str, enabled: bool, day: str) -> None:
    """Active/désactive le résumé hebdomadaire et fixe son jour d'envoi."""
    with _lock:
        data = _load()
        existing = data["weekly_summaries"].get(user_id, {})
        data["weekly_summaries"][user_id] = {**existing, "enabled": enabled, "day": day}
        _save(data)


def get_weekly_summary_prefs(user_id: str) -> dict | None:
    with _lock:
        return _load()["weekly_summaries"].get(user_id)


def get_all_weekly_summary_prefs() -> dict[str, dict]:
    with _lock:
        return dict(_load()["weekly_summaries"])


def save_upcoming_events_snapshot(user_id: str, events: list[dict]) -> None:
    """Mémorise la dernière liste connue des événements à venir de l'utilisateur."""
    with _lock:
        data = _load()
        existing = data["weekly_summaries"].get(user_id, {})
        data["weekly_summaries"][user_id] = {**existing, "events_snapshot": events}
        _save(data)


def mark_weekly_summary_sent(user_id: str, date_str: str) -> None:
    """Enregistre la date (locale, AAAA-MM-JJ) du dernier envoi, pour éviter les doublons."""
    with _lock:
        data = _load()
        existing = data["weekly_summaries"].get(user_id, {})
        data["weekly_summaries"][user_id] = {**existing, "last_sent_date": date_str}
        _save(data)
