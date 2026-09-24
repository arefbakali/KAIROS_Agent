# KAIROS — backend FastAPI/LangGraph.
#
# Ollama tourne dans son propre conteneur (service « ollama » de
# docker-compose.yml). Le backend le joint via OLLAMA_BASE_URL, fourni par
# Compose (http://ollama:11434 par défaut).

FROM python:3.11-slim

# Journaux visibles immédiatement dans « docker compose logs », pas de .pyc.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# La base de fuseaux horaires IANA n'est pas garantie sur une image slim :
# app/agent/fuseau.py en a besoin pour zoneinfo (voir requirements.txt, où
# le paquet Python tzdata est limité à Windows — ici c'est le paquet système).
RUN apt-get update \
    && apt-get install -y --no-install-recommends tzdata \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Les rappels e-mail écrivent ici (jetons Gmail, rappels planifiés) : ce
# dossier est recouvert par le volume monté dans docker-compose.yml, ce
# mkdir ne sert que si l'image tourne sans lui.
RUN mkdir -p /app/data \
    && useradd --create-home --uid 1000 appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
