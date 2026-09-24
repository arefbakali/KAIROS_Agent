"""Scheduler de rappels : vérifie toutes les 30 secondes si un rappel doit être envoyé.

Tourne en arrière-plan via APScheduler. Indépendant du frontend — fonctionne
même si le navigateur est fermé, tant que le serveur tourne.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from apscheduler.schedulers.background import BackgroundScheduler

from app.services import reminder_storage
from app.services.gmail_sender import send_reminder_email, send_weekly_summary_email

log = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None

#: Heure locale (fuseau de l'utilisateur) à laquelle envoyer le résumé hebdomadaire.
_WEEKLY_SUMMARY_HOUR = 8


def _check_and_send() -> None:
    """Boucle principale : envoie les rappels dont l'heure est venue."""
    pending = reminder_storage.get_pending_reminders()
    if not pending:
        return

    log.info("%d rappel(s) en attente.", len(pending))

    for reminder in pending:
        user_id = reminder["user_id"]
        tokens = reminder_storage.get_tokens(user_id)
        if not tokens:
            log.info("Pas de token pour l'utilisateur %s, rappel supprimé.", user_id)
            reminder_storage.mark_sent(reminder["event_id"], reminder["kind"])
            continue

        email = tokens["email"]
        label = reminder_storage.KIND_LABELS.get(reminder["kind"], reminder["kind"])

        success = send_reminder_email(
            user_id=user_id,
            to_email=email,
            event_title=reminder["event_title"],
            event_start=reminder["event_start"],
            event_end=reminder.get("event_end", ""),
            reminder_label=label,
        )

        if success:
            reminder_storage.mark_sent(reminder["event_id"], reminder["kind"])
            log.info(
                "Rappel envoyé : %s (%s) pour %s",
                reminder["event_title"],
                label,
                email,
            )
        else:
            reminder_storage.mark_failed(reminder["event_id"], reminder["kind"])
            log.warning(
                "Échec du rappel : %s (%s) pour %s",
                reminder["event_title"],
                label,
                email,
            )


def _dans_les_7_jours(start_iso: str, reference: datetime) -> bool:
    """L'événement démarre-t-il entre maintenant et dans 7 jours (heure locale) ?"""
    try:
        start = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
    except ValueError:
        return False
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    start_local = start.astimezone(reference.tzinfo)
    return reference <= start_local <= reference + timedelta(days=7)


def _check_weekly_summaries() -> None:
    """Fonctionnalité additionnelle, indépendante des rappels 1j/1h/30min ci-dessus.

    Vérifie, pour chaque utilisateur ayant activé le résumé hebdomadaire, si
    aujourd'hui (dans son fuseau horaire) correspond au jour choisi et si le
    créneau d'envoi vient d'être atteint, sans jamais renvoyer deux fois le
    même jour.
    """
    prefs = reminder_storage.get_all_weekly_summary_prefs()
    if not prefs:
        return

    for user_id, entry in prefs.items():
        if not entry.get("enabled"):
            continue
        day = entry.get("day")
        if day not in reminder_storage.WEEKDAYS:
            continue

        tokens = reminder_storage.get_tokens(user_id)
        if not tokens:
            continue

        tz_name = tokens.get("timezone") or "UTC"
        try:
            now_local = datetime.now(ZoneInfo(tz_name))
        except (ZoneInfoNotFoundError, KeyError):
            now_local = datetime.now(timezone.utc)

        if reminder_storage.WEEKDAYS[now_local.weekday()] != day:
            continue
        if now_local.hour != _WEEKLY_SUMMARY_HOUR:
            continue

        today_str = now_local.date().isoformat()
        if entry.get("last_sent_date") == today_str:
            continue  # déjà envoyé aujourd'hui

        semaine = [
            event
            for event in entry.get("events_snapshot", [])
            if _dans_les_7_jours(event.get("start", ""), now_local)
        ]

        success = send_weekly_summary_email(
            user_id=user_id,
            to_email=tokens.get("email", ""),
            events=semaine,
            tz_name=tz_name,
        )
        if success:
            reminder_storage.mark_weekly_summary_sent(user_id, today_str)
            log.info("Résumé hebdomadaire envoyé pour l'utilisateur %s.", user_id)
        else:
            log.warning("Échec de l'envoi du résumé hebdomadaire pour %s.", user_id)


def start_scheduler() -> None:
    """Démarre le scheduler en arrière-plan. Appelé une seule fois au démarrage."""
    global _scheduler
    if _scheduler is not None:
        return

    _scheduler = BackgroundScheduler()
    _scheduler.add_job(
        _check_and_send,
        "interval",
        seconds=30,
        id="kairos_reminder_check",
        replace_existing=True,
    )
    _scheduler.add_job(
        _check_weekly_summaries,
        "interval",
        minutes=15,
        id="kairos_weekly_summary_check",
        replace_existing=True,
    )
    _scheduler.start()
    log.info("Scheduler de rappels démarré (vérification toutes les 30s, résumé hebdomadaire toutes les 15 min).")


def stop_scheduler() -> None:
    """Arrête le scheduler proprement."""
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        log.info("Scheduler de rappels arrêté.")
