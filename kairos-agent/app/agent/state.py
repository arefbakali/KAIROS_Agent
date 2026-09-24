"""État circulant dans le graphe LangGraph."""

from __future__ import annotations

from typing import Any, TypedDict

from datetime import tzinfo

from app.agent.periode import Periode
from app.schemas import CalendarEvent, PeriodFacts


class AgentState(TypedDict, total=False):
    # --- Entrées ---------------------------------------------------------
    events: list[CalendarEvent]
    message: str
    date: str | None
    end_date: str | None
    scope: str | None
    first_name: str | None
    #: Fuseau de l'utilisateur, résolu une fois pour tout le graphe.
    zone: tzinfo

    # --- Mémoire conversationnelle ---------------------------------------
    session_id: str
    conversation_history: str
    pending_action: dict[str, Any] | None
    recent_events_summary: str

    # --- Produit par « comprendre » --------------------------------------
    periode: Periode
    intent: str
    intent_reason: str

    # --- Produit par « extraire » ----------------------------------------
    facts: PeriodFacts
    periode_events: list[CalendarEvent]

    # --- Produit par « présenter » ---------------------------------------
    headline: str
    points: list[str]
    narrative: str

    # --- Produit par « agir » --------------------------------------------
    action: str

    # --- Sortie ----------------------------------------------------------
    blocks: list[dict[str, Any]]
    degraded: bool
    degraded_reason: str | None
