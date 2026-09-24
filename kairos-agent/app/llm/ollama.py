"""Modèles locaux servis par Ollama (Llama, Qwen3, Mistral…)."""

from __future__ import annotations

import json
from typing import Any

import httpx

from app.llm.base import LLMProvider, LLMUnavailable, Piece


VISION_HINTS = ("llava", "vl", "vision", "gemma3", "minicpm", "moondream", "granite3.2-vision")


class OllamaProvider(LLMProvider):
    name = "ollama"

    @property
    def supports_vision(self) -> bool:  # type: ignore[override]
        """Vrai seulement si le modèle installé est multimodal."""
        modele = self.model.lower()
        return any(indice in modele for indice in VISION_HINTS)

    def __init__(self, model: str, base_url: str, timeout: float = 120.0) -> None:
        super().__init__(model, timeout)
        self.base_url = base_url.rstrip("/")

    async def chat(
        self,
        system: str,
        user: str,
        *,
        schema: dict[str, Any] | None = None,
        temperature: float = 0.3,
        max_tokens: int = 500,
    ) -> str:
        content = user
        if schema:
            # Ceinture et bretelles : Ollama ignore silencieusement `format`
            # quand `think` est désactivé sur la série Qwen3. On décrit donc
            # aussi le schéma dans le message.
            content = (
                f"{user}\n\nRéponds UNIQUEMENT par un objet JSON valide respectant ce schéma, "
                f"sans texte autour, sans balises Markdown :\n{json.dumps(schema, ensure_ascii=False)}"
            )

        payload: dict[str, Any] = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": content},
            ],
            "think": False,
            "stream": False,
            "options": {"temperature": 0 if schema else temperature, "num_predict": max_tokens},
        }
        if schema:
            payload["format"] = schema

        return await self._envoyer(payload)

    async def _envoyer(self, payload: dict[str, Any]) -> str:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(f"{self.base_url}/api/chat", json=payload)
        except httpx.HTTPError as error:
            raise LLMUnavailable(
                f"Ollama est injoignable sur {self.base_url}. Lancez « ollama serve »."
            ) from error

        if response.status_code == 404:
            raise LLMUnavailable(
                f"Le modèle « {self.model} » n'est pas installé. Lancez « ollama pull {self.model} »."
            )
        if response.status_code >= 400:
            raise LLMUnavailable(f"Ollama a répondu {response.status_code} : {response.text[:200]}")

        return response.json().get("message", {}).get("content", "")

    async def chat_vision(
        self,
        system: str,
        user: str,
        pieces: list[Piece],
        *,
        schema: dict[str, Any] | None = None,
        max_tokens: int = 2000,
    ) -> str:
        images = [p for p in pieces if p.mime.startswith("image/")]
        if not images:
            raise LLMUnavailable(
                "Ollama ne lit pas les PDF directement. Utilisez un modèle multimodal, ou un PDF "
                "contenant du texte sélectionnable."
            )

        payload: dict[str, Any] = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user, "images": [p.base64 for p in images]},
            ],
            "think": False,
            "stream": False,
            "options": {"temperature": 0, "num_predict": max_tokens},
        }
        if schema:
            payload["format"] = schema

        contenu = await self._envoyer(payload)
        if not contenu.strip():
            raise LLMUnavailable(
                f"Le modèle « {self.model} » n'a rien renvoyé. Est-il multimodal ? "
                "Essayez « ollama pull qwen2.5vl:7b » puis LLM_MODEL=qwen2.5vl:7b."
            )
        return contenu

    async def ping(self) -> tuple[bool, str | None]:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.base_url}/api/tags")
            response.raise_for_status()
        except httpx.HTTPError:
            return False, f"Ollama injoignable sur {self.base_url}."

        installed = {m.get("name", "") for m in response.json().get("models", [])}
        if self.model in installed or f"{self.model}:latest" in installed:
            return True, None
        return False, f"Modèle « {self.model} » absent. Lancez « ollama pull {self.model} »."
