"""Route d'import : une image ou un PDF, des événements détectés."""

from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.llm import LLMUnavailable, current_provider
from app.services.document import MIME_PDF, MIMES_IMAGE, analyser

router = APIRouter(prefix="/api/import", tags=["import"])


@router.post("/analyze")
async def analyze(file: UploadFile = File(...)) -> dict:
    """Analyse un document et renvoie les événements détectés.

    Aucun événement n'est écrit dans Google Calendar : le front-end affiche la
    liste, l'utilisateur corrige, sélectionne, puis confirme.
    """
    data = await file.read()
    if not data:
        raise HTTPException(status_code=422, detail="Le fichier est vide.")

    try:
        return await analyser(data, file.content_type or "", file.filename or "document")
    except ValueError as erreur:
        raise HTTPException(status_code=422, detail=str(erreur)) from erreur
    except LLMUnavailable as erreur:
        raise HTTPException(status_code=503, detail=str(erreur)) from erreur


@router.get("/capabilities")
async def capabilities() -> dict:
    """Le modèle configuré sait-il lire une image ?"""
    fournisseur = current_provider()
    return {
        "model": fournisseur.label(),
        "vision": fournisseur.supports_vision,
        "acceptedMimeTypes": sorted([*MIMES_IMAGE, MIME_PDF]),
        "hint": (
            None
            if fournisseur.supports_vision
            else "Les PDF contenant du texte fonctionnent. Pour les images ou les PDF scannés, "
            "installez un modèle multimodal (« ollama pull qwen2.5vl:7b » puis LLM_MODEL=qwen2.5vl:7b)."
        ),
    }
