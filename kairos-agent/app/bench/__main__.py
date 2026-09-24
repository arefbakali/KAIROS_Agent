"""Banc d'essai en ligne de commande.

    python -m app.bench ollama
    python -m app.bench ollama:llama3.2:3b

Sans argument, seul le modèle configuré dans .env est évalué.
"""

from __future__ import annotations

import asyncio
import sys

from app.bench.runner import evaluer, tableau_markdown
from app.config import settings


def _decouper(argument: str) -> tuple[str, str | None]:
    """« ollama:llama3.2:3b » → ("ollama", "llama3.2:3b")."""
    if ":" not in argument:
        return argument, None
    fournisseur, modele = argument.split(":", 1)
    return fournisseur, modele


async def principal(cibles: list[str]) -> None:
    if not cibles:
        cibles = [settings.llm_provider]

    resultats = []
    for cible in cibles:
        fournisseur, modele = _decouper(cible)
        print(f"→ évaluation de {cible} …", flush=True)
        resultats.append(await evaluer(fournisseur, modele))

    print()
    print(tableau_markdown(resultats))
    print()

    for resultat in resultats:
        echecs = [c for c in resultat["cas"] if c["precision"] < 1 or not c["succes"]]
        if not echecs:
            continue
        print(f"Détail — {resultat['modele']}")
        for cas in echecs:
            print(f"  • {cas['cas']} : {cas['note'] or 'précision partielle'}")
        print()


if __name__ == "__main__":
    asyncio.run(principal(sys.argv[1:]))
