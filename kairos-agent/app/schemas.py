"""Contrats d'échange avec le front-end.

Les noms de champs reproduisent exactement ceux de `src/types/index.ts` côté
React : le front-end peut consommer les réponses sans aucune transformation.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

EventKind = Literal[
    "reunion", "concentration", "pause", "deplacement", "personnel", "cours", "tache"
]


class CalendarEvent(BaseModel):
    """Événement tel que le front-end l'a lu dans Google Calendar."""

    id: str
    title: str
    start: datetime
    end: datetime
    kind: EventKind = "reunion"
    location: str | None = None
    travelMinutes: int = 0
    source: Literal["google", "kairos", "local"] = "google"
    taskId: str | None = None
    notes: str | None = None
    locked: bool = False


class ScoreCriterion(BaseModel):
    key: str
    label: str
    weight: float = Field(ge=0, le=1)
    detail: str


class Explanation(BaseModel):
    summary: str
    criteria: list[ScoreCriterion] = []


class DayBrief(BaseModel):
    """Résumé d'une journée à l'intérieur d'une période."""

    date: str
    weekday: str
    eventCount: int
    busyMinutes: int
    firstStart: str | None = None
    lastEnd: str | None = None
    titles: list[str] = []


class WeekBrief(BaseModel):
    """Agrégat hebdomadaire, utilisé pour les périodes longues."""

    start: str
    end: str
    label: str
    eventCount: int
    busyMinutes: int
    busiestDay: str | None = None


class PeriodFacts(BaseModel):
    """Faits calculés sur la période demandée, quelle que soit sa longueur.

    Rien ici ne provient du modèle : tout est compté en Python.
    """

    start: str
    end: str
    label: str
    dayCount: int
    granularity: Literal["jour", "semaine"]

    eventCount: int
    busyMinutes: int
    meetingMinutes: int
    focusMinutes: int
    freeMinutes: int

    days: list[DayBrief] = []
    weeks: list[WeekBrief] = []

    busiestDay: str | None = None
    lightestWorkingDay: str | None = None
    freeDays: list[str] = []

    firstStart: str | None = None
    lastEnd: str | None = None
    nextEventTitle: str | None = None
    nextEventStart: str | None = None
    nextEventDate: str | None = None
    longestFreeSlot: dict[str, str] | None = None

    overlaps: list[str] = []
    tightTravel: list[str] = []

    # Bornes réelles des données reçues du front-end : permet de dire
    # honnêtement « je ne vois rien au-delà du 3 novembre ».
    coverageStart: str | None = None
    coverageEnd: str | None = None
    outsideCoverage: bool = False


# --- Blocs de réponse, image exacte du type AssistantBlock côté React -------


class TextBlock(BaseModel):
    type: Literal["texte"] = "texte"
    content: str


class WarningBlock(BaseModel):
    type: Literal["avertissement"] = "avertissement"
    title: str
    content: str


class DaySummaryBlock(BaseModel):
    type: Literal["resume-journee"] = "resume-journee"
    headline: str
    points: list[str]


class ExplanationBlock(BaseModel):
    type: Literal["explication"] = "explication"
    explanation: Explanation


class ResultBlock(BaseModel):
    type: Literal["resultat"] = "resultat"
    status: Literal["succes", "echec"]
    content: str


AssistantBlock = TextBlock | WarningBlock | DaySummaryBlock | ExplanationBlock | ResultBlock


class AssistantMessage(BaseModel):
    id: str
    role: Literal["agent"] = "agent"
    createdAt: datetime
    blocks: list[AssistantBlock]


# --- Requêtes ---------------------------------------------------------------


class PresentRequest(BaseModel):
    """Le front-end détient le jeton Google ; il envoie donc les événements déjà lus."""

    events: list[CalendarEvent] = []
    start: str | None = Field(default=None, description="Début de période, AAAA-MM-JJ.")
    end: str | None = Field(default=None, description="Fin de période incluse, AAAA-MM-JJ.")
    date: str | None = Field(default=None, description="Raccourci : une seule journée.")
    query: str | None = Field(
        default=None, description="Expression libre : « la semaine prochaine », « le 12 août »."
    )
    timezone: str | None = Field(
        default=None, description="Fuseau IANA du navigateur, ex. « Africa/Tunis »."
    )
    firstName: str | None = None
    sessionId: str | None = Field(
        default=None, description="Identifiant de session pour la mémoire conversationnelle."
    )


# Conservé pour compatibilité : ancien nom de la requête journalière.
PresentDayRequest = PresentRequest


class ChatRequest(BaseModel):
    message: str
    events: list[CalendarEvent] = []
    date: str | None = None
    timezone: str | None = Field(
        default=None, description="Fuseau IANA du navigateur, ex. « Africa/Tunis »."
    )
    firstName: str | None = None
    sessionId: str | None = Field(
        default=None, description="Identifiant de session pour la mémoire conversationnelle."
    )


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    provider: str
    model: str
    reachable: bool
    detail: str | None = None
