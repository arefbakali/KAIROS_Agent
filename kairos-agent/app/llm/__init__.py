"""Point d'accès unique au modèle, quel que soit le fournisseur configuré.

Les nœuds de l'agent n'importent que `generate_text`, `generate_json` et
`ping` : ils ignorent complètement qu'il s'agit d'Ollama derrière. Changer de
modèle se fait uniquement dans le fichier .env.
"""

from __future__ import annotations

from typing import Any

from app.config import settings
from app.llm.base import LLMProvider, LLMUnavailable, clean_text, extract_json
from app.llm.ollama import OllamaProvider

__all__ = [
    "LLMProvider",
    "LLMUnavailable",
    "build_provider",
    "current_provider",
    "extract_json",
    "generate_json",
    "generate_text",
    "ping",
]

#: Modèle utilisé par défaut si `LLM_MODEL` n'est pas précisé.
DEFAULT_MODELS = {
    "ollama": "llama3.2:3b",
}


def build_provider(provider: str | None = None, model: str | None = None) -> LLMProvider:
    """Construit un fournisseur. Sert aussi au banc d'essai, modèle par modèle."""
    nom = (provider or settings.llm_provider).strip().lower()

    # Le modèle configuré ne vaut que pour le fournisseur configuré.
    configure = settings.llm_model if nom == settings.llm_provider.strip().lower() else ""
    modele = (model or configure or DEFAULT_MODELS.get(nom, "")).strip()

    if nom == "ollama":
        return OllamaProvider(modele or DEFAULT_MODELS["ollama"], settings.ollama_base_url, settings.llm_timeout)

    raise LLMUnavailable(f"Fournisseur « {nom} » inconnu. Seule valeur acceptée : ollama.")


_provider: LLMProvider | None = None


def current_provider() -> LLMProvider:
    """Fournisseur actif, construit une seule fois."""
    global _provider
    if _provider is None or _provider.model != (settings.llm_model or _provider.model):
        _provider = build_provider()
    return _provider


async def generate_text(system: str, user: str, temperature: float = 0.3) -> str:
    """Réponse en langage naturel."""
    raw = await current_provider().chat(system, user, temperature=temperature, max_tokens=400)
    return clean_text(raw)


async def generate_json(system: str, user: str, schema: dict[str, Any]) -> Any:
    """Réponse structurée, avec analyse tolérante de la sortie."""
    raw = await current_provider().chat(system, user, schema=schema, max_tokens=400)
    return extract_json(raw)


async def ping() -> tuple[bool, str | None]:
    return await current_provider().ping()
