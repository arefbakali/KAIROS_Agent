"""Assemblage du graphe LangGraph.

                    ┌──▶ agir ─────────────────┐
    comprendre ─────┤                          ├──▶ fin
                    └──▶ extraire ─▶ présenter ┘

L'ordre compte : la période doit être résolue avant toute extraction, sinon
l'agent ne saurait pas quelles journées lire. `extraire` est entièrement
déterministe ; les deux autres nœuds appellent Qwen3.
"""

from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from app.agent.nodes.agir import agir
from app.agent.nodes.comprendre import comprendre
from app.agent.nodes.extraire import extraire
from app.agent.nodes.presenter import presenter
from app.agent.state import AgentState


def _aiguiller(state: AgentState) -> str:
    """Une demande d'action court-circuite la présentation."""
    if state.get("intent") in ("creer_evenement", "supprimer_evenement"):
        return "agir"
    return "extraire"


def build_graph():
    builder = StateGraph(AgentState)

    builder.add_node("comprendre", comprendre)
    builder.add_node("agir", agir)
    builder.add_node("extraire", extraire)
    builder.add_node("presenter", presenter)

    builder.add_edge(START, "comprendre")
    builder.add_conditional_edges(
        "comprendre",
        _aiguiller,
        {"agir": "agir", "extraire": "extraire"},
    )
    # « agir » produit déjà ses blocs : il n'a pas besoin du présentateur.
    builder.add_edge("agir", END)
    builder.add_edge("extraire", "presenter")
    builder.add_edge("presenter", END)

    return builder.compile()


agent_graph = build_graph()
