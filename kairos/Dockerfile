# KAIROS — frontend React/TypeScript, servi en statique par nginx.
#
# Étape 1 : build. Les VITE_* sont passés en arguments de build par
# docker-compose.yml (fichier .env racine) : ce sont des valeurs publiques,
# visibles dans n'importe quel bundle client (VITE_GOOGLE_CLIENT_ID n'est pas
# un secret, voir GoogleSetupGuide.tsx). Le .env local n'est pas copié
# (.dockerignore) : l'image ne dépend que de ce que Compose lui fournit.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_GOOGLE_CLIENT_ID=""
ARG VITE_AGENT_API_URL="http://localhost:8000"
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID \
    VITE_AGENT_API_URL=$VITE_AGENT_API_URL
RUN npm run build

# Étape 2 : exécution. Seuls les fichiers statiques produits passent dans
# l'image finale — ni node_modules, ni .env, ni les sources TypeScript.
FROM nginx:1.28-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
