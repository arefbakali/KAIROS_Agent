# KAIROS — Own your time.

Agent d'organisation personnelle branché sur votre vrai Google Calendar et votre vraie boîte Gmail.
Interface entièrement en français, prêt à recevoir un back-end FastAPI + LangGraph + Ollama + SQLite.

> Projet universitaire — sujet #22, « Agent IA d'organisation personnelle »,
> encadré par Mme Khaoula El Bedoui.

*Kairos*, en grec, désigne le moment opportun — par opposition à *Chronos*, le temps qui s'écoule.
C'est exactement ce que l'application cherche : non pas afficher le temps, mais repérer l'instant où
il faut agir.

---

## Lancer le projet

```bash
npm install
cp .env.example .env
# renseigner VITE_GOOGLE_CLIENT_ID (voir « Configurer Google » plus bas)
npm run dev
```

L'application démarre sur <http://localhost:5173>.

| Commande            | Effet                                                        |
| ------------------- | ------------------------------------------------------------ |
| `npm run dev`       | Serveur de développement Vite avec rechargement à chaud       |
| `npm run build`     | Vérification des types puis build de production dans `dist/`  |
| `npm run preview`   | Sert le build de production localement                        |
| `npm run typecheck` | Vérifie les types sans produire de fichiers                   |

**Un identifiant client Google est obligatoire.** Il n'y a pas de mode démonstration : KAIROS
travaille sur le compte réel qui se connecte.

---

## Concept

**« Own your time. »** — l'agent propose, vous tranchez, l'agent explique.

Aucune création, modification ou suppression d'événement n'a lieu sans confirmation explicite, et
chaque décision porte un bouton « Pourquoi ce choix ? » détaillant ses critères pondérés.

## Identité visuelle

**Couleurs** — azur et violet indigo sur un papier froid légèrement bleuté. Le dégradé de marque
n'apparaît qu'à trois endroits : le logo, l'action principale et le bandeau de connexion. Jamais en
fond de contenu — c'est ce qui sépare un produit d'un template.

| Rôle                       | Clair     | Sombre    |
| -------------------------- | --------- | --------- |
| Papier (fond)              | `#F4F5FA` | `#08091A` |
| Surface                    | `#FFFFFF` | `#101227` |
| Encre                      | `#12142B` | `#E8EAFA` |
| **Violet indigo — marque** | `#6C4CF1` | `#8B6DFF` |
| **Azur — second ton**      | `#2B7BF6` | `#4E96FF` |
| Urgence                    | `#E14B5A` | `#F0707D` |
| Validation                 | `#0EA47F` | `#2DC39C` |

Dégradé de marque : `linear-gradient(135deg, #2B7BF6, #6C4CF1)`.

**Typographie**

- `Space Grotesk` — titres et signature de marque
- `Inter` — interface et corps de texte
- `JetBrains Mono` — heures, durées, scores, intertitres

**Logo** — un cercle ouvert, celui du temps qui passe, et un point plein qui marque l'instant à
saisir.

**Élément signature** — la chronologie du jour : blocs strictement proportionnels à leur durée,
bandes hachurées annotées pour les créneaux libres, curseur d'instant, et mode comparaison où la
proposition apparaît en pointillés à sa position cible.

---

## Structure des pages

| Route            | Écran            | Rôle                                                             |
| ---------------- | ---------------- | ---------------------------------------------------------------- |
| `/connexion`     | Connexion        | Compte Google — seule route publique                              |
| `/`              | Vue d'ensemble   | Temps protégé / engagé, semaine en cours, tâches urgentes          |
| `/aujourdhui`    | Aujourd'hui      | En-tête éditorial, prochaine meilleure action, attention nécessaire, chronologie |
| `/planning`      | Planning         | Jour · Semaine · Liste · Plan proposé, avec mode comparaison        |
| `/taches`        | Tâches           | Six modes de regroupement, priorité calculée, raison du classement  |
| `/assistant`     | Assistant IA     | Copilote plein cadre pour les échanges longs                        |
| `/activite`      | Activité         | Journal des décisions                                               |
| `/notifications` | Notifications    | Classées par ce qu'elles exigent, filtrables                        |
| `/integrations`  | Intégrations     | Compte connecté, portées accordées, calendriers, Gmail              |
| `/parametres`    | Paramètres       | Horaires, comportement de l'agent, thème                            |

**Palette de commandes** — `Ctrl + K` (Windows/Linux) ou `Cmd + K` (macOS).

---

## Configurer Google (gratuit, sans carte bancaire)

Les API Calendar et Gmail sont gratuites et **ne demandent aucun compte de facturation**. Le crédit
de 300 $ mis en avant par Google concerne les services facturables (machines virtuelles, BigQuery) —
ignorez-le.

1. Créer un projet sur <https://console.cloud.google.com/projectcreate>.
2. Activer **Google Calendar API** puis **Gmail API** dans la bibliothèque d'API.
3. Écran de consentement OAuth : type **Externe**, état **Test**, votre adresse Gmail ajoutée comme
   *utilisateur de test*. Les portées sensibles fonctionnent alors sans validation ni frais.
4. Créer un **ID client OAuth**, type **Application Web**. Dans *Origines JavaScript autorisées*,
   ajouter exactement `http://localhost:5173`. Aucun secret client n'est nécessaire.
5. Renseigner `.env` puis relancer `npm run dev` :

```bash
VITE_GOOGLE_CLIENT_ID=123456789-abcdefg.apps.googleusercontent.com
```

Ce guide est aussi affiché dans l'application, sur l'écran de connexion et la page Intégrations.

**Restez en mode « Test »** : passer en « Production » avec des portées Gmail déclencherait une
vérification Google avec audit de sécurité, celle-là payante. Vous n'en avez aucun besoin.

### Erreur `origin_mismatch`

L'origine enregistrée ne correspond pas à celle du navigateur. Vérifiez le port réel dans la barre
d'adresse — si `5173` était occupé, Vite a pu basculer sur `5174`. `strictPort` est activé dans
`vite.config.ts` pour éviter ce piège. Notez que `localhost` et `127.0.0.1` sont deux origines
distinctes pour Google.

---

## Authentification et autorisation

Une **seule fenêtre de consentement** couvre tout, à la connexion :

| Portée                        | Ce qu'elle permet                                  |
| ----------------------------- | --------------------------------------------------- |
| `openid email profile`        | Savoir qui est connecté, personnaliser l'espace      |
| `calendar.readonly` + `events`| Lire et écrire les événements                        |
| `gmail.readonly` + `send`     | Repérer les invitations, envoyer les rappels         |

Dès le retour de Google, l'application travaille sur le compte réel : vos événements remplissent la
chronologie, les conflits sont calculés sur vos vrais rendez-vous, et accepter une proposition écrit
dans votre calendrier.

Le jeton vit en `sessionStorage` — fermer l'onglet ferme la session. « Se déconnecter » le révoque
en plus côté Google. Si une portée a été refusée, la page Intégrations propose de relancer le
consentement pour elle seule.

**Limite structurelle** : le flux implicite ne fournit pas de jeton de rafraîchissement, la session
dure environ une heure. Et la signature de l'ID token n'est pas vérifiée côté client — c'est
impossible dans un front-end. Une application en production doit la valider côté serveur : ce sera
la première responsabilité du back-end FastAPI.

---

## Ce qui vient de Google, ce qui est local

| Donnée                    | Source                                                     |
| ------------------------- | ---------------------------------------------------------- |
| Événements du calendrier  | **Google Calendar**, en direct                              |
| Conflits et trajets       | **Calculés** sur vos vrais événements (`lib/conflictDetection.ts`) |
| Identité, avatar, fuseau  | **Google**                                                  |
| Invitations par courriel  | **Gmail**, en direct                                        |
| Tâches, notifications, journal d'activité | **Locales** — ce sont les données propres de KAIROS, que le back-end FastAPI persistera en SQLite |

Les tâches n'existent pas dans Google Calendar : c'est le concept que KAIROS ajoute. Elles vivent
en mémoire pour l'instant, et deviennent de vrais événements Google dès que vous acceptez un
créneau.

---

## Arborescence

```
src/
├── app/                 App.tsx · router.tsx · providers.tsx
├── components/
│   ├── ui/              button, badge, card, dialog, tooltip, switch,
│   │                    field, segmented, skeleton, meter
│   ├── layout/          AppShell, Sidebar, MobileNav, PageHeader, Logo,
│   │                    RequireSession, UserMenu
│   ├── assistant/       CopilotPanel, Composer, AssistantBlocks
│   ├── calendar/        DayTimeline, WeekGrid, EventBlock,
│   │                    ComparisonView, EventDetailSheet
│   ├── tasks/           TaskCard, TaskDialog
│   ├── conflicts/       AttentionBlock, WhyDialog
│   ├── notifications/   NotificationList
│   ├── integrations/    GoogleSetupGuide
│   └── command-menu/    CommandMenu
├── pages/               SignIn, Overview, Today, Calendar, Tasks, Assistant,
│                        Activity, Notifications, Integrations, Settings, NotFound
├── hooks/               useTheme, useHotkey, useSpeechRecognition,
│                        useWorkspaceData, useGoogle
├── services/
│   ├── google/          gis (OAuth), auth.api, calendar.api, gmail.api
│   └── …                api, mock, calendar, tasks, assistant, notifications
├── store/               useSessionStore, useWorkspaceStore, useAssistantStore
├── types/ schemas/ mocks/ lib/ styles/
```

## Stack

React 19 · TypeScript strict · Vite 6 · Tailwind CSS 4 · Radix UI · React Router 7 ·
TanStack Query 5 · Zustand 5 · React Hook Form + Zod · Framer Motion · Lucide · date-fns ·
dnd-kit · cmdk · Sonner.

Tailwind 4 en configuration CSS-first : les tokens vivent dans `src/styles/globals.css` sous
`@theme`, il n'y a pas de `tailwind.config.js`. La grille temporelle est faite maison plutôt qu'avec
FullCalendar, pour contrôler les blocs proportionnels et les états fantômes de la comparaison.

---

## Scénario de démonstration

1. Ouvrir <http://localhost:5173> → **Continuer avec Google** → consentement.
2. *Aujourd'hui* affiche votre prénom et vos vrais événements du jour.
3. Créez volontairement deux rendez-vous qui se chevauchent dans Google Calendar, rechargez :
   KAIROS les détecte et propose un déplacement.
4. **Pourquoi ce choix ?** → les critères pondérés s'affichent, corrigez la règle si besoin.
5. **Accepter** → l'événement bouge réellement dans Google Calendar, vérifiez-le.
6. Dans le copilote : `Réorganise ma journée`, `Trouve un créneau de deux heures`, ou dictez au
   microphone (Chrome).
7. `Ctrl + K` → **Créer une tâche** → priorité calculée → **Réserver ce créneau** crée l'événement.
8. *Planning* → **Plan proposé** → accepter une partie seulement des déplacements.
9. *Intégrations* → **M'envoyer un résumé de test** → vérifier ses messages envoyés.

---

## Brancher le back-end FastAPI

```bash
VITE_USE_MOCKS=false
VITE_API_BASE_URL=http://localhost:8000
```

Contrat d'URL déclaré dans `src/services/api.ts` :

```
GET/POST/PATCH/DELETE  /api/calendar/events[/:id]
GET/POST/PATCH/DELETE  /api/tasks[/:id]
POST                   /api/agent/chat | plan-day | resolve-conflict | prioritize
GET                    /api/notifications
POST                   /api/integrations/google-calendar/connect | gmail/connect
```

### Étapes suivantes

1. **FastAPI** — reproduire les modèles de `src/types/index.ts` en Pydantic ; les noms de champs
   sont déjà alignés.
2. **OAuth côté serveur** — vérifier l'ID token, stocker les jetons de rafraîchissement, supprimer
   la limite d'une heure.
3. **SQLite** — `events`, `tasks`, `preferences`, `decisions`. La dernière alimente la page Activité
   et l'apprentissage des préférences.
4. **LangGraph** — un nœud par route `/api/agent/*`. Chaque nœud renvoie une liste conforme au type
   `AssistantBlock`, ce qui permet à l'UI d'afficher créneaux, comparaisons et confirmations sans
   code supplémentaire.
5. **Ollama** — servir le LLM local derrière le nœud de compréhension. Garder le scoring
   déterministe (`src/lib/priority.ts`) pour que les explications restent vérifiables.

---

## Accessibilité

Navigation au clavier partout, focus visible, libellés accessibles, aucune information transmise par
la seule couleur, zones cliquables d'au moins 32 px, `prefers-reduced-motion` respecté.

## Responsive

Grand écran (navigation + travail + copilote ancré), portable (copilote réductible), tablette
(copilote flottant), téléphone (barre de navigation basse, copilote plein écran, planning en jour ou
liste).
