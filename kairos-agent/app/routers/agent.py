"""Routes de l'agent, alignées sur le contrat déclaré côté front-end."""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException

from app.agent.fuseau import base_iana_disponible, en_local, resoudre_zone
from app.agent.graph import agent_graph
from app.config import settings
from app.llm import current_provider, ping
from app.schemas import ChatRequest, HealthResponse, PresentRequest
from app.services.memory import memory_store

router = APIRouter(prefix="/api/agent", tags=["agent"])

# Actions considérées comme terminées → on efface la mémoire de pending.
_COMPLETED_ACTIONS = {
    "creation_proposee",
    "suppression_proposee",
    "conflit",
    "suppression_introuvable",
}


async def _run(
    events,
    message: str,
    date: str | None = None,
    end_date: str | None = None,
    scope: str | None = None,
    first_name: str | None = None,
    tz_name: str | None = None,
    session_id: str | None = None,
) -> dict:
    zone = resoudre_zone(tz_name)
    sid = session_id or f"anon_{uuid.uuid4().hex[:8]}"

    # Le front-end transmet des horodatages en UTC. On les ramène tout de suite
    # dans le fuseau de l'utilisateur : ensuite, tout le graphe raisonne en
    # heure locale et « 10:15 » veut dire 10:15 partout.
    for event in events:
        event.start = en_local(event.start, zone)
        event.end = en_local(event.end, zone)

    # Charger la mémoire conversationnelle.
    history = memory_store.format_history_for_prompt(sid)
    pending = memory_store.get_pending_action(sid)

    # Mettre à jour le résumé des événements récents.
    memory_store.update_recent_events(sid, events)
    recent_ev = memory_store.get_recent_events(sid)

    try:
        result = await agent_graph.ainvoke(
            {
                "events": events,
                "message": message,
                "date": date,
                "end_date": end_date,
                "scope": scope,
                "first_name": first_name,
                "zone": zone,
                "session_id": sid,
                "conversation_history": history,
                "pending_action": pending,
                "recent_events_summary": recent_ev,
            }
        )
    except Exception as error:  # noqa: BLE001 — le détail remonte au client
        raise HTTPException(status_code=502, detail=f"Échec de l'agent : {error}") from error

    # Stocker l'échange dans la mémoire.
    memory_store.add_user_message(sid, message)
    intent = result.get("intent", "")
    action_status = result.get("action", "")

    # Générer un résumé court de la réponse pour la mémoire.
    blocks = result.get("blocks", [])
    assistant_summary = _summarize_response(blocks, intent)
    memory_store.add_assistant_message(sid, assistant_summary, intent)

    # Gérer le pending_action : le mettre à jour ou l'effacer.
    _update_pending(sid, intent, action_status, message, result)

    # Le chemin « agir » ne produit pas de faits : il propose une action.
    facts = result.get("facts")
    periode = result.get("periode")

    return {
        "id": f"m_{uuid.uuid4().hex[:8]}",
        "role": "agent",
        "createdAt": datetime.now().isoformat(),
        "blocks": result["blocks"],
        "period": (
            {"start": facts.start, "end": facts.end, "label": facts.label}
            if facts
            else {
                "start": periode.debut.isoformat() if periode else None,
                "end": periode.fin.isoformat() if periode else None,
                "label": periode.libelle if periode else None,
            }
        ),
        "intent": result.get("intent"),
        "action": result.get("action"),
    }


def _summarize_response(blocks: list[dict], intent: str) -> str:
    """Extrait un résumé court de la réponse pour la mémoire."""
    for block in blocks:
        btype = block.get("type", "")
        if btype == "resume-journee":
            headline = block.get("headline", "")
            points = block.get("points", [])
            if points:
                return f"{headline} — {points[0]}"
            return headline
        if btype == "avertissement":
            return block.get("content", "")[:150]
        if btype == "action-creer":
            return f"Proposition de création : {block.get('question', '')}"
        if btype == "action-supprimer":
            return f"Proposition de suppression : {block.get('question', '')}"
        if btype == "resultat":
            return block.get("content", "")[:150]
    return f"[{intent}]"


def _update_pending(
    sid: str, intent: str, action_status: str, message: str, result: dict
) -> None:
    """Met à jour ou efface le pending_action selon le résultat."""
    # Si une action est terminée (proposée, conflit, introuvable), effacer.
    if action_status in _COMPLETED_ACTIONS:
        memory_store.clear_pending_action(sid)
        return

    # Si l'action est incomplète, la stocker avec le contexte résolu.
    if action_status == "creation_incomplete":
        blocks = result.get("blocks", [])
        warning = next((b for b in blocks if b.get("type") == "avertissement"), None)
        content = warning.get("content", "") if warning else ""
        pending = {
            "type": "creation_incomplete",
            "message": message,
            "detail": content[:200],
        }
        periode = result.get("periode")
        if periode and hasattr(periode, "debut"):
            pending["jour"] = periode.debut.isoformat()
        action_block = next((b for b in blocks if b.get("type") == "action-creer"), None)
        if action_block:
            if action_block.get("title"):
                pending["titre"] = action_block["title"]
            if action_block.get("question"):
                pending["question"] = action_block["question"]
        memory_store.set_pending_action(sid, pending)
        return

    # Si l'action est ambigüe, la stocker pour résolution.
    if action_status == "suppression_ambigue":
        blocks = result.get("blocks", [])
        warning = next((b for b in blocks if b.get("type") == "avertissement"), None)
        content = warning.get("content", "") if warning else ""
        memory_store.set_pending_action(
            sid,
            {
                "type": "suppression_ambigue",
                "message": message,
                "detail": content[:200],
            },
        )
        return

    # Si pas d'action en cours et pas de pending existant, ne rien faire.


@router.post("/present")
async def present(payload: PresentRequest) -> dict:
    """Extraction puis présentation d'une période : un jour, une semaine, un mois."""
    return await _run(
        payload.events,
        payload.query or "",
        payload.date or payload.start,
        payload.end,
        None,
        payload.firstName,
        payload.timezone,
        payload.sessionId,
    )


@router.post("/present-day")
async def present_day(payload: PresentRequest) -> dict:
    """Alias conservé pour compatibilité avec la première version."""
    return await present(payload)


@router.post("/chat")
async def chat(payload: ChatRequest) -> dict:
    """Même graphe : la période et l'intention sont déduites du message."""
    if not payload.message.strip():
        raise HTTPException(status_code=422, detail="Le message est vide.")
    return await _run(
        payload.events,
        payload.message,
        payload.date,
        None,
        None,
        payload.firstName,
        payload.timezone,
        payload.sessionId,
    )


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    provider = current_provider()
    reachable, detail = await ping()

    if not base_iana_disponible():
        avertissement = (
            "Base de fuseaux horaires absente : lancez « python -m pip install tzdata ». "
            "En attendant, les heures sont calculées en UTC."
        )
        detail = f"{detail} {avertissement}" if detail else avertissement

    return HealthResponse(
        status="ok" if reachable else "degraded",
        provider=provider.name,
        model=provider.model,
        reachable=reachable,
        detail=detail,
    )
