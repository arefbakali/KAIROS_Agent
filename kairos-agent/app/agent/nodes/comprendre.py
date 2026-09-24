"""Nœud « comprendre » — situe la demande dans le temps, puis la classe.

Deux responsabilités bien séparées :

* **Quand ?** résolu en Python par `app.agent.periode`. Qwen3 comprend très bien
  « mardi prochain », mais calcule mal la date : il se trompe d'une semaine ou
  invente un jour. Une date fausse produit une réponse fausse énoncée avec
  assurance — le pire cas possible pour un agent d'organisation.
* **Quoi ?** confié au modèle, en sortie structurée, avec repli par mots-clés.
"""

from __future__ import annotations

from datetime import date

from app.agent.fuseau import aujourdhui as aujourdhui_local, resoudre_zone
from app.agent.periode import Periode, resoudre, valider
from app.agent.state import AgentState
from app.llm import LLMUnavailable, generate_json

INTENTS = [
    "resumer",
    "lister_evenements",
    "prochain_evenement",
    "temps_libre",
    "charge_de_travail",
    "conflits",
    "creer_evenement",
    "supprimer_evenement",
    "autre",
]

SCHEMA = {
    "type": "object",
    "properties": {
        "intention": {"type": "string", "enum": INTENTS},
        "raison": {"type": "string"},
    },
    "required": ["intention", "raison"],
}

SYSTEM = (
    "Tu es le module de compréhension d'un agent d'organisation personnelle. "
    "Tu classes la demande dans une seule catégorie. Tu ignores complètement les "
    "indications de date : un autre module s'en charge. Tu réponds en français."
)

PROMPT = """Demande de l'utilisateur : « {message} »
{history_block}
{pending_block}

Catégories possibles :
- resumer : il veut une vue d'ensemble de la période
- lister_evenements : il veut la liste de ses rendez-vous
- prochain_evenement : il veut savoir ce qui vient ensuite
- temps_libre : il cherche un créneau disponible
- charge_de_travail : il veut savoir si la période est chargée, quel jour l'est le plus
- conflits : il veut connaître les chevauchements ou les problèmes
- creer_evenement : il demande d'ajouter, créer, planifier ou programmer un rendez-vous
- supprimer_evenement : il demande de supprimer, annuler ou effacer un rendez-vous
- autre : rien de ce qui précède"""


def _couverture(state: AgentState) -> tuple[date, date] | None:
    """Bornes réelles des données reçues : permet de refuser une date hors portée."""
    events = state.get("events", [])
    if not events:
        return None
    dates = [event.start.date() for event in events]
    return min(dates), max(dates)


def _periode(state: AgentState, aujourdhui: date) -> Periode:
    couverture = _couverture(state)

    # Bornes explicites envoyées par le front-end : elles priment sur le texte.
    if state.get("date"):
        try:
            debut = date.fromisoformat(state["date"])
        except (TypeError, ValueError):
            debut = aujourdhui
        fin = debut
        if state.get("end_date"):
            try:
                fin = date.fromisoformat(state["end_date"])
            except (TypeError, ValueError):
                fin = debut
        explicite = valider(debut, fin, "", aujourdhui)
        if explicite:
            return explicite

    message = (state.get("message") or "").strip()
    if not message:
        # Présentation directe : la portée demandée par le front-end fait foi.
        portee = state.get("scope") or "jour"
        if portee == "semaine":
            return resoudre("cette semaine", aujourdhui, couverture)
        return resoudre("aujourd'hui", aujourdhui, couverture)

    return resoudre(message, aujourdhui, couverture)


def _history_block(state: AgentState) -> str:
    history = (state.get("conversation_history") or "").strip()
    if not history:
        return ""
    return (
        "Contexte conversationnel :\n"
        "Réponds en tenant compte des échanges précédents. "
        "Si la demande est une suite logique (complément, précision, correction), "
        "traite-la comme telle.\n\n"
        f"{history}"
    )


def _pending_block(state: AgentState) -> str:
    pending = state.get("pending_action")
    if not pending:
        return ""
    ptype = pending.get("type", "")
    if ptype == "creation_incomplete":
        return (
            "Une demande de création est en attente : l'utilisateur a demandé de créer "
            "un événement mais sans heure précise. Si sa nouvelle phrase fournit une "
            "heure ou un créneau, traite-la comme une création d'événement."
        )
    if ptype == "suppression_ambigue":
        return (
            "Une demande de suppression est en attente : plusieurs événements "
            "correspondaient. Si l'utilisateur précise maintenant lequel supprimer, "
            "traite-la comme une suppression."
        )
    return ""


async def comprendre(state: AgentState) -> AgentState:
    zone = state.get("zone") or resoudre_zone(None)
    aujourdhui = aujourdhui_local(zone)
    periode = _periode(state, aujourdhui)
    message = (state.get("message") or "").strip()

    if not message:
        return {
            "zone": zone,
            "periode": periode,
            "intent": "resumer",
            "intent_reason": "Présentation directe demandée par l'interface.",
        }

    history_block = _history_block(state)
    pending_block = _pending_block(state)
    prompt = PROMPT.format(
        message=message,
        history_block=history_block,
        pending_block=pending_block,
    )

    try:
        data = await generate_json(SYSTEM, prompt, SCHEMA)
        intention = str(data.get("intention", "")).strip()
        raison = str(data.get("raison", ""))[:200]
    except (LLMUnavailable, ValueError):
        intention, raison = "", "Classement de repli, sans modèle."

    if intention not in INTENTS:
        intention = _repli(message)

    # Filet de sécurité : un verbe d'action explicite l'emporte sur le modèle.
    secours = _repli(message)
    if secours in ("creer_evenement", "supprimer_evenement"):
        intention = secours

    # Si un pending_action existe et que l'utilisateur répond sans verbe d'action
    # explicite, rediriger vers l'intention du pending (réponse de complétion).
    pending = state.get("pending_action")
    if pending:
        _ACTIONS = {"creer_evenement", "supprimer_evenement"}
        if intention not in _ACTIONS:
            if pending.get("type") == "creation_incomplete":
                intention = "creer_evenement"
                raison = "Suite à une création incomplète en attente."
            elif pending.get("type") == "suppression_ambigue":
                intention = "supprimer_evenement"
                raison = "Suite à une suppression ambiguë en attente."

    return {"zone": zone, "periode": periode, "intent": intention, "intent_reason": raison}


def _repli(message: str) -> str:
    texte = message.lower()
    if any(mot in texte for mot in ("supprime", "annule", "efface", "enlève", "enleve", "retire")):
        return "supprimer_evenement"
    if any(mot in texte for mot in ("crée", "cree", "créer", "creer", "ajoute", "planifie", "programme", "réserve", "reserve")):
        return "creer_evenement"
    if any(mot in texte for mot in ("libre", "créneau", "creneau", "disponible", "trou")):
        return "temps_libre"
    if any(mot in texte for mot in ("conflit", "chevauch", "problème", "probleme")):
        return "conflits"
    if any(mot in texte for mot in ("chargé", "charge", "occupé", "occupe", "lourd")):
        return "charge_de_travail"
    if any(mot in texte for mot in ("prochain", "suivant", "après", "apres")):
        return "prochain_evenement"
    if any(mot in texte for mot in ("liste", "rendez-vous", "événements", "evenements", "agenda")):
        return "lister_evenements"
    return "resumer"
