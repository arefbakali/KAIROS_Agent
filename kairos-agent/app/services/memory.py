"""Mémoire conversationnelle à court terme par session.

Garde les 10 derniers échanges (utilisateur + assistant) pour chaque session,
un pending_action pour les demandes incomplètes, et un résumé compact des
événements récents. Tout est en mémoire RAM — pas de persistance.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

_MAX_MESSAGES = 10


@dataclass
class ConversationTurn:
    role: str  # "user" | "assistant"
    content: str
    intent: str | None = None
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class SessionMemory:
    messages: list[ConversationTurn] = field(default_factory=list)
    pending_action: dict[str, Any] | None = None
    recent_events_summary: str = ""


class MemoryStore:
    """Stockage en RAM, un par session, thread-safe."""

    def __init__(self, max_sessions: int = 200) -> None:
        self._sessions: dict[str, SessionMemory] = {}
        self._lock = threading.Lock()
        self._max_sessions = max_sessions

    def _get_or_create(self, session_id: str) -> SessionMemory:
        if session_id not in self._sessions:
            if len(self._sessions) >= self._max_sessions:
                oldest = next(iter(self._sessions))
                del self._sessions[oldest]
            self._sessions[session_id] = SessionMemory()
        return self._sessions[session_id]

    # ── Messages ──────────────────────────────────────────────────────────

    def add_user_message(self, session_id: str, content: str, intent: str | None = None) -> None:
        with self._lock:
            mem = self._get_or_create(session_id)
            mem.messages.append(ConversationTurn(role="user", content=content, intent=intent))
            self._trim(mem)

    def add_assistant_message(
        self, session_id: str, content: str, intent: str | None = None
    ) -> None:
        with self._lock:
            mem = self._get_or_create(session_id)
            mem.messages.append(ConversationTurn(role="assistant", content=content, intent=intent))
            self._trim(mem)

    def get_history(self, session_id: str) -> list[ConversationTurn]:
        with self._lock:
            mem = self._sessions.get(session_id)
            if not mem:
                return []
            return list(mem.messages)

    def format_history_for_prompt(self, session_id: str) -> str:
        """Historique compact pour injecter dans le prompt LLM."""
        turns = self.get_history(session_id)
        if not turns:
            return ""
        lines = ["Conversation précédente :"]
        for t in turns:
            prefix = "Utilisateur" if t.role == "user" else "KAIROS"
            lines.append(f"  {prefix} : {t.content[:150]}")
        return "\n".join(lines)

    def _trim(self, mem: SessionMemory) -> None:
        while len(mem.messages) > _MAX_MESSAGES:
            mem.messages.pop(0)

    # ── Pending action ────────────────────────────────────────────────────

    def set_pending_action(self, session_id: str, action: dict[str, Any]) -> None:
        with self._lock:
            mem = self._get_or_create(session_id)
            mem.pending_action = action

    def get_pending_action(self, session_id: str) -> dict[str, Any] | None:
        with self._lock:
            mem = self._sessions.get(session_id)
            return mem.pending_action if mem else None

    def clear_pending_action(self, session_id: str) -> None:
        with self._lock:
            mem = self._sessions.get(session_id)
            if mem:
                mem.pending_action = None

    # ── Recent events context ─────────────────────────────────────────────

    def update_recent_events(self, session_id: str, events: list[Any]) -> None:
        """Stocke un résumé compact des événements proches (≤ 5 lignes)."""
        if not events:
            return
        now = datetime.now()
        upcoming = sorted(
            [e for e in events if hasattr(e, "start") and e.start.replace(tzinfo=None) >= now],
            key=lambda e: e.start,
        )[:8]
        if not upcoming:
            return
        lines = []
        for e in upcoming:
            lines.append(
                f"- {e.title}, {e.start.strftime('%a %d/%m %H:%M')}-{e.end.strftime('%H:%M')}"
            )
        with self._lock:
            mem = self._get_or_create(session_id)
            mem.recent_events_summary = "\n".join(lines)

    def get_recent_events(self, session_id: str) -> str:
        with self._lock:
            mem = self._sessions.get(session_id)
            return mem.recent_events_summary if mem else ""

    # ── Clearing ──────────────────────────────────────────────────────────

    def clear_session(self, session_id: str) -> None:
        with self._lock:
            self._sessions.pop(session_id, None)


memory_store = MemoryStore()
