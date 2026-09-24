"""Contrat commun à tous les fournisseurs de modèle.

Un seul point d'entrée, `chat`, avec ou sans schéma JSON. Chaque fournisseur
traduit ce contrat vers son propre format d'API. Les nœuds de l'agent ne savent
jamais quel modèle répond derrière.
"""

from __future__ import annotations

import json
import re
from abc import ABC, abstractmethod
from typing import Any


class LLMUnavailable(RuntimeError):
    """Le fournisseur ne répond pas, ou la clé est absente."""


_FENCE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.S)
_THINK = re.compile(r"<think>.*?</think>", re.S)


def clean_text(raw: str) -> str:
    """Retire les balises de réflexion et les clôtures Markdown."""
    text = _THINK.sub("", raw or "").strip()
    fenced = _FENCE.search(text)
    return fenced.group(1).strip() if fenced else text


def extract_json(raw: str) -> Any:
    """Récupère le premier objet JSON valide, même dans une réponse bavarde.

    Indispensable : `response_format` n'est pas une garantie stricte selon le
    serveur et le modèle. Ce filet de sécurité récupère le JSON même si le
    modèle l'entoure de balises Markdown ou de commentaires.
    """
    text = clean_text(raw)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    for opening, closing in (("{", "}"), ("[", "]")):
        start = text.find(opening)
        if start == -1:
            continue
        depth = 0
        for index in range(start, len(text)):
            if text[index] == opening:
                depth += 1
            elif text[index] == closing:
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(text[start : index + 1])
                    except json.JSONDecodeError:
                        break
    raise ValueError("Le modèle n'a pas renvoyé de JSON exploitable.")


class Piece:
    """Document envoyé au modèle : image ou PDF."""

    def __init__(self, data: bytes, mime: str, nom: str = "document") -> None:
        self.data = data
        self.mime = mime
        self.nom = nom

    @property
    def base64(self) -> str:
        import base64 as _b64

        return _b64.b64encode(self.data).decode()


class LLMProvider(ABC):
    """Fournisseur de modèle. Une implémentation par service."""

    name: str = "inconnu"
    #: Le modèle sait-il lire une image ou un PDF ? Faux par défaut : un modèle
    #: texte seul (comme Llama 3.2 3B Instruct) ne peut pas.
    supports_vision: bool = False

    def __init__(self, model: str, timeout: float = 120.0) -> None:
        self.model = model
        self.timeout = timeout

    @abstractmethod
    async def chat(
        self,
        system: str,
        user: str,
        *,
        schema: dict[str, Any] | None = None,
        temperature: float = 0.3,
        max_tokens: int = 500,
    ) -> str:
        """Renvoie le texte brut produit par le modèle."""

    @abstractmethod
    async def ping(self) -> tuple[bool, str | None]:
        """(joignable, message d'erreur lisible)."""

    async def chat_vision(
        self,
        system: str,
        user: str,
        pieces: list["Piece"],
        *,
        schema: dict[str, Any] | None = None,
        max_tokens: int = 2000,
    ) -> str:
        """Lecture d'un document. Par défaut : non pris en charge.

        Redéfini par les fournisseurs multimodaux. llama3.2:3b (le modèle
        servi par défaut) est texte seul : cette méthode par défaut s'applique
        donc tant qu'un modèle de vision n'est pas installé à sa place.
        """
        raise LLMUnavailable(
            f"{self.name} ne sait pas lire d'image ni de PDF avec le modèle « {self.model} ». "
            "Installez un modèle multimodal (« ollama pull qwen2.5vl:7b ») pour lire des images."
        )

    def label(self) -> str:
        return f"{self.name}:{self.model}"
