"""Nœud « présenter » — met les faits en français lisible.

Le modèle ne reçoit que des faits déjà calculés et un agenda borné. La consigne
lui interdit d'ajouter le moindre chiffre : s'il en énonce un, il ne peut venir
que de ce qu'on lui a donné. Les points factuels, eux, ne passent jamais par le
modèle — ils sont composés en Python.
"""

from __future__ import annotations

from app.agent.nodes.extraire import format_agenda
from app.agent.state import AgentState
from app.llm import LLMUnavailable, generate_text
from app.schemas import PeriodFacts

SYSTEM = (
    "Tu es KAIROS, un agent d'organisation personnelle. "
    "Tu t'exprimes en français, avec des phrases courtes et concrètes. "
    "RÈGLE ABSOLUE : n'invente aucun horaire, aucun nom d'événement, aucune date "
    "et aucun chiffre. Tu ne peux utiliser que les informations fournies. "
    "Si l'agenda est vide, dis-le simplement. "
    "Pas de liste à puces, pas de Markdown, pas d'emoji. Trois phrases maximum."
    " Si l'utilisateur a posé une question de suivi, réponds de manière cohérente "
    "avec les échanges précédents."
)

CONSIGNE = {
    "resumer": "Résume la période en soulignant ce qui demande de l'attention.",
    "lister_evenements": "Présente les rendez-vous dans l'ordre, en une phrase fluide.",
    "prochain_evenement": "Annonce le prochain rendez-vous et situe-le dans le temps.",
    "temps_libre": "Indique les plages libres et laquelle est la plus exploitable.",
    "charge_de_travail": "Dis si la période est chargée et quel jour l'est le plus.",
    "conflits": "Signale les chevauchements et les trajets serrés, sans dramatiser.",
    "autre": "Décris l'état de la période de manière utile.",
}


def _duree(minutes: int) -> str:
    heures, reste = divmod(minutes, 60)
    if heures and reste:
        return f"{heures} h {reste:02d}"
    if heures:
        return f"{heures} h"
    return f"{reste} min"


def _fiche(facts: PeriodFacts) -> str:
    lignes = [
        f"Période : {facts.label} (du {facts.start} au {facts.end}, {facts.dayCount} jour(s))",
        f"Nombre d'événements : {facts.eventCount}",
        f"Temps occupé : {facts.busyMinutes} minutes",
        f"Dont réunions et cours : {facts.meetingMinutes} minutes",
        f"Dont travail concentré : {facts.focusMinutes} minutes",
        f"Temps libre en heures ouvrées : {facts.freeMinutes} minutes",
    ]
    if facts.busiestDay:
        lignes.append(f"Journée la plus chargée : {facts.busiestDay}")
    if facts.lightestWorkingDay:
        lignes.append(f"Journée ouvrée la plus légère : {facts.lightestWorkingDay}")
    if facts.freeDays:
        lignes.append("Journées sans aucun événement : " + ", ".join(facts.freeDays[:7]))
    if facts.nextEventTitle:
        lignes.append(
            f"Prochain événement : {facts.nextEventTitle}, {facts.nextEventDate} "
            f"à {facts.nextEventStart}"
        )
    if facts.longestFreeSlot:
        creneau = facts.longestFreeSlot
        lignes.append(
            f"Plus longue plage libre : {creneau.get('date', '')} de {creneau['start']} "
            f"à {creneau['end']}"
        )
    if facts.overlaps:
        lignes.append("Chevauchements : " + " ; ".join(facts.overlaps[:5]))
    if facts.tightTravel:
        lignes.append("Trajets serrés : " + " ; ".join(facts.tightTravel[:5]))
    if facts.outsideCoverage:
        lignes.append(
            "ATTENTION : la période demandée dépasse les données disponibles "
            f"({facts.coverageStart} → {facts.coverageEnd})."
        )
    return "\n".join(lignes)


def _points(facts: PeriodFacts) -> list[str]:
    points: list[str] = []

    if facts.eventCount == 0:
        points.append(f"Aucun événement au calendrier pour {facts.label}.")
        if facts.outsideCoverage:
            points.append(
                f"Données disponibles seulement du {facts.coverageStart} au {facts.coverageEnd}."
            )
        elif facts.nextEventTitle:
            points.append(
                f"Prochain rendez-vous connu : {facts.nextEventTitle}, "
                f"{facts.nextEventDate} à {facts.nextEventStart}."
            )
        return points

    if facts.dayCount == 1:
        points.append(
            f"{facts.eventCount} événements, soit {_duree(facts.busyMinutes)} d'occupation."
        )
        if facts.firstStart and facts.lastEnd:
            points.append(f"Journée de {facts.firstStart} à {facts.lastEnd}.")
    else:
        moyenne = facts.busyMinutes // max(facts.dayCount, 1)
        points.append(
            f"{facts.eventCount} événements sur {facts.dayCount} jours, "
            f"soit {_duree(facts.busyMinutes)} au total ({_duree(moyenne)} par jour en moyenne)."
        )
        if facts.busiestDay:
            points.append(f"Journée la plus chargée : {facts.busiestDay}.")
        if facts.freeDays:
            libres = ", ".join(facts.freeDays[:4])
            suite = "…" if len(facts.freeDays) > 4 else ""
            points.append(f"Aucun événement le {libres}{suite}.")

    if facts.meetingMinutes:
        points.append(f"Réunions et cours : {_duree(facts.meetingMinutes)}.")
    if facts.longestFreeSlot:
        creneau = facts.longestFreeSlot
        jour = f"{creneau.get('date', '')} " if creneau.get("date") else ""
        points.append(f"Plus longue plage libre : {jour}{creneau['start']} – {creneau['end']}.")
    if facts.nextEventTitle:
        points.append(
            f"Prochain : {facts.nextEventTitle}, {facts.nextEventDate} à {facts.nextEventStart}."
        )

    for chevauchement in facts.overlaps[:4]:
        points.append(f"Conflit : {chevauchement}.")
    for trajet in facts.tightTravel[:3]:
        points.append(f"Trajet : {trajet}.")

    if facts.outsideCoverage:
        points.append(
            f"Vue partielle : données connues du {facts.coverageStart} au {facts.coverageEnd}."
        )
    return points


def _detail_par_jour(facts: PeriodFacts) -> dict | None:
    """Découpage jour par jour, dès que la période dépasse une journée."""
    if facts.dayCount <= 1 or facts.granularity != "jour":
        return None
    lignes = [
        f"{brief.weekday} : {brief.eventCount} événement(s)"
        + (f", {brief.firstStart}–{brief.lastEnd}" if brief.firstStart else "")
        + (f" — {', '.join(brief.titles[:3])}" if brief.titles else "")
        for brief in facts.days
        if brief.eventCount
    ]
    if not lignes:
        return None
    return {"type": "resume-journee", "headline": f"Détail de {facts.label}", "points": lignes}


def _detail_par_semaine(facts: PeriodFacts) -> dict | None:
    """Au-delà de seize jours, on résume semaine par semaine."""
    if facts.granularity != "semaine" or not facts.weeks:
        return None
    lignes = [
        f"{semaine.label} : {semaine.eventCount} événement(s), {_duree(semaine.busyMinutes)}"
        + (f", pic le {semaine.busiestDay}" if semaine.busiestDay else "")
        for semaine in facts.weeks
    ]
    return {"type": "resume-journee", "headline": f"Semaine par semaine — {facts.label}", "points": lignes}


async def presenter(state: AgentState) -> AgentState:
    facts: PeriodFacts = state["facts"]
    prenom = state.get("first_name")
    consigne = CONSIGNE.get(state.get("intent", "resumer"), CONSIGNE["autre"])

    history = (state.get("conversation_history") or "").strip()
    history_section = ""
    if history:
        history_section = f"\nContexte des échanges précédents :\n{history}\n"

    prompt = (
        f"{consigne}\n\n"
        f"Prénom de l'utilisateur : {prenom or 'inconnu'}\n"
        f"{history_section}\n"
        f"Faits calculés :\n{_fiche(facts)}\n\n"
        f"Agenda :\n{format_agenda(facts, state.get('periode_events', []))}"
    )

    points = _points(facts)

    try:
        narrative = await generate_text(SYSTEM, prompt)
        degraded, reason = False, None
    except LLMUnavailable as error:
        narrative = _repli_narratif(facts, prenom)
        degraded, reason = True, str(error)

    headline = narrative.split("\n")[0].strip() or _repli_narratif(facts, prenom)

    blocks: list[dict] = [{"type": "resume-journee", "headline": headline, "points": points}]

    for detail in (_detail_par_jour(facts), _detail_par_semaine(facts)):
        if detail:
            blocks.append(detail)

    if facts.overlaps or facts.tightTravel:
        blocks.append(
            {
                "type": "avertissement",
                "title": "Points à vérifier dans votre agenda",
                "content": "\n".join(
                    f"• {item}" for item in [*facts.overlaps[:6], *facts.tightTravel[:4]]
                ),
            }
        )

    if degraded:
        blocks.append(
            {
                "type": "resultat",
                "status": "echec",
                "content": f"Modèle local indisponible : {reason} Les faits restent exacts.",
            }
        )

    return {
        "narrative": narrative,
        "headline": headline,
        "points": points,
        "blocks": blocks,
        "degraded": degraded,
        "degraded_reason": reason,
    }


def _repli_narratif(facts: PeriodFacts, prenom: str | None) -> str:
    salutation = f"Bonjour {prenom}, " if prenom else ""
    if facts.eventCount == 0:
        return f"{salutation}aucun événement n'est prévu pour {facts.label}."
    conflits = " Un point demande votre attention." if facts.overlaps else ""
    return (
        f"{salutation}{facts.label} compte {facts.eventCount} événements "
        f"pour {_duree(facts.busyMinutes)} d'occupation.{conflits}"
    )
