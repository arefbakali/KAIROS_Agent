# KAIROS — Docker

## Services

| Service | Image | Rôle | Port hôte |
| --- | --- | --- | --- |
| `ollama` | `ollama/ollama:${OLLAMA_VERSION}` | Sert Llama 3.2 3B | aucun (réseau interne) |
| `ollama-pull` | idem | Télécharge le modèle s'il manque, puis s'arrête | aucun |
| `backend` | `kairos-backend` (build `kairos-agent/`) | FastAPI + LangGraph | `8000` |
| `frontend` | `kairos-frontend` (build `kairos/`) | nginx : fichiers statiques + proxy `/api/` | `5173` |

Ordre de démarrage : `ollama` (sain) → `ollama-pull` (terminé) → `backend` (sain) → `frontend`.

## Configuration

| Fichier | Contenu | Lu par |
| --- | --- | --- |
| `.env` (racine, depuis `.env.example`) | ports, `LLM_MODEL`, `OLLAMA_VERSION`, `VITE_*` | Docker Compose |
| `kairos-agent/.env` (depuis `.env.example`) | secrets Google OAuth, `FRONTEND_ORIGIN`, `GOOGLE_REDIRECT_URI`, `LLM_TIMEOUT` | conteneur backend |

`OLLAMA_BASE_URL` et `LLM_MODEL` de la racine priment sur ceux de `kairos-agent/.env`
dans Docker. Hors Docker (`uvicorn` en local), rien ne change.

## Commandes

```bash
docker compose up -d --build          # construire + démarrer
docker compose ps                     # état / santé
docker compose logs -f                # tous les journaux
docker compose logs -f backend        # un service
docker compose logs ollama-pull       # progression du téléchargement du modèle
docker compose stop                   # arrêter (conteneurs conservés)
docker compose down                   # arrêter + supprimer les conteneurs (volumes conservés)
docker compose build --no-cache       # reconstruire sans cache
docker compose up -d --build backend  # reconstruire un seul service
docker compose exec ollama ollama list
```

GPU NVIDIA : `docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d`

Ollama natif de l'hôte au lieu du conteneur : dans `.env`,
`OLLAMA_BASE_URL=http://host.docker.internal:11434`, puis
`docker compose up -d --build --no-deps backend frontend`.

## Données persistantes

- Volume nommé `kairos-ollama-models` → `/root/.ollama` : poids du modèle.
- Dossier `./kairos-agent/data` → `/app/data` : `reminders.json` (jetons OAuth Gmail, rappels,
  résumés hebdomadaires). Linux : `sudo chown -R 1000:1000 kairos-agent/data` (utilisateur `appuser`).

`docker compose down -v` supprime le volume du modèle (retéléchargement ~2 Go).

## Déploiement sur un serveur

1. Installer Docker Engine + plugin Compose v2.20+ (≥ 4 Go de RAM libres pour le modèle sur CPU).
2. Copier le projet **sans** `node_modules/`, `dist/`, `.venv/` ni `kairos-agent/data/`.
3. `cp .env.example .env` et `cp kairos-agent/.env.example kairos-agent/.env`, puis renseigner :
   - `.env` : `VITE_GOOGLE_CLIENT_ID`, `VITE_AGENT_API_URL=https://<domaine>`
   - `kairos-agent/.env` : `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
     `FRONTEND_ORIGIN=https://<domaine>`, `GOOGLE_REDIRECT_URI=https://<domaine>/api/reminders/callback`
4. Google Cloud Console : ajouter `https://<domaine>` aux origines JavaScript et
   l'URI de redirection ci-dessus.
5. Placer un terminateur HTTPS (Caddy, Traefik, nginx…) devant le port `5173`. HTTPS est
   indispensable hors `localhost` : Google OAuth le refuse en HTTP, et le navigateur bloque
   `crypto.randomUUID` et la reconnaissance vocale hors contexte sécurisé.
6. `mkdir -p kairos-agent/data && sudo chown -R 1000:1000 kairos-agent/data`
7. `docker compose up -d --build`, puis attendre `docker compose ps` → tous `healthy`.
8. Vérifier : `curl https://<domaine>/api/agent/health` → `"reachable": true`.

En mode serveur, le navigateur ne parle qu'au frontend (nginx relaie `/api/*`). Docker
publie ses ports en contournant `ufw` : pour ne pas exposer le backend, mettre
`BACKEND_PORT=127.0.0.1:8000` dans `.env` (et `FRONTEND_PORT=127.0.0.1:5173` si le
terminateur HTTPS tourne sur l'hôte).
