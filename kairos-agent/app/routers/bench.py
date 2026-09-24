"""Route du banc d'essai, pour comparer les modèles depuis l'API."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.bench import evaluer, tableau_markdown
from app.config import settings

router = APIRouter(prefix="/api/bench", tags=["bench"])


class BenchRequest(BaseModel):
    #: « ollama », ou « ollama:llama3.2:3b » pour préciser le modèle.
    targets: list[str] = []


@router.post("/run")
async def run(payload: BenchRequest) -> dict:
    cibles = payload.targets or [settings.llm_provider]
    resultats = []
    for cible in cibles:
        fournisseur, _, modele = cible.partition(":")
        resultats.append(await evaluer(fournisseur, modele or None))
    return {"results": resultats, "markdown": tableau_markdown(resultats)}
