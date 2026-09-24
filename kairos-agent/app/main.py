"""Point d'entrée du back-end KAIROS."""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import settings
from app.routers import agent, bench, documents, reminders
from app.services.reminder_scheduler import start_scheduler, stop_scheduler

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(
    title="KAIROS — agent",
    version="0.1.0",
    description="Extraction et présentation des informations de Google Calendar, via Llama 3.2 3B (Ollama, en local).",
    lifespan=lifespan,
)

# Le front-end tourne sur un autre port : sans CORS, le navigateur bloque tout.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin, "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agent.router)
app.include_router(bench.router)
app.include_router(documents.router)
app.include_router(reminders.router)


@app.get("/")
def root() -> dict[str, str]:
    return {
        "service": "kairos-agent",
        "provider": settings.llm_provider,
        "model": settings.llm_model or "(défaut du fournisseur)",
        "docs": "/docs",
    }
