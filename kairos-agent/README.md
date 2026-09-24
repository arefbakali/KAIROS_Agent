# KAIROS — partie agent (Ollama + Llama 3.2 3B, en local)

Première capacité de l'agent : **extraire** les informations de Google Calendar et les
**présenter** en français. Rien d'autre pour l'instant — pas de réorganisation, pas d'écriture.

---

## Architecture

```
Navigateur (KAIROS)                      Machine locale
┌──────────────────────┐                ┌─────────────────────────────┐
│  React + jeton Google│                │  FastAPI  :8000             │
│                      │  événements    │    └─ LangGraph             │
│  Google Calendar ────┼───────────────▶│         extraire            │
│  (lecture directe)   │                │            ↓                │
│                      │◀───────────────┤         comprendre ──┐      │
│  Copilote            │  blocs de      │            ↓         │      │
└──────────────────────┘  réponse       │         présenter ───┼──────┼──▶ Ollama :11434
                                        └─────────────────────────────┘      llama3.2:3b
```

**Pourquoi le front-end envoie les événements au back-end ?** Le jeton OAuth vit dans le
navigateur (flux implicite). Le back-end n'a donc aucun accès direct à Google. Il reçoit les
événements déjà lus, raisonne dessus, et renvoie des blocs de réponse. Le jour où l'OAuth passera
côté serveur, seul le service front-end change — l'interface, elle, ne bouge pas.

## Le graphe

| Nœud | Rôle | LLM ? |
| --- | --- | --- |
| `extraire` | Filtre le jour, calcule durées, chevauchements, trajets serrés, plages libres | **Non** — Python pur |
| `comprendre` | Classe la demande : résumé, liste, prochain, temps libre | Oui, sortie JSON |
| `présenter` | Rédige deux à quatre phrases en français | Oui, texte libre |

**Le principe qui tient tout** : aucun chiffre n'est produit par le modèle. Tout ce qui est
compté l'est en Python, dans `extraire`. Le modèle ne reçoit que des faits déjà établis et n'a le
droit que de les mettre en phrases. Un agent qui annonce « trois réunions » quand il y en a deux
détruit la confiance dans tout le reste.

## Deux pièges contournés

**1. Ollama ignore `format` quand `think` est désactivé, sur certains modèles.**
La sortie structurée peut redevenir du texte libre sans erreur ni avertissement. `app/llm/ollama.py`
ne s'y fie donc jamais : le schéma est aussi décrit dans le prompt, et `extract_json` récupère le
premier objet JSON valide même si le modèle l'entoure de balises Markdown ou de bavardage.

**2. Certains modèles émettent des blocs `<think>`.** Ils sont retirés systématiquement avant
affichage (`clean_text`).

## Mode dégradé

Si Ollama est éteint ou le modèle absent, l'API répond quand même **200** : les faits calculés
restent exacts, seule la prose est remplacée par une phrase générique, et un bloc signale la panne.
Une démonstration ne s'effondre pas parce qu'un service local n'a pas démarré.

## Endpoints

| Méthode | Route | Rôle |
| --- | --- | --- |
| `POST` | `/api/agent/present-day` | Extraction + présentation d'une journée |
| `POST` | `/api/agent/chat` | Même graphe, intention déduite du message |
| `GET` | `/api/agent/health` | Ollama joignable ? modèle installé ? |

Documentation interactive : <http://localhost:8000/docs>

## Tests

```bash
python tests/test_agent.py
```

Quinze vérifications avec un faux serveur Ollama (`tests/fake_ollama.py`, aucun modèle réel requis) :
comptages exacts, détection de chevauchement, trajet insuffisant, nettoyage des balises `<think>`,
JSON emballé dans du Markdown, journée vide, et mode dégradé.

---

## Changer de modèle

Un seul fournisseur : Ollama, en local. Un seul endroit à modifier : le fichier `.env`.

```bash
LLM_PROVIDER=ollama
LLM_MODEL=llama3.2:3b            # installé via « ollama pull llama3.2:3b »
OLLAMA_BASE_URL=http://localhost:11434
```

Changer de modèle revient à `ollama pull <autre-modèle>` puis à mettre à jour `LLM_MODEL` —
aucun code Python à toucher.

Les nœuds de l'agent n'importent que `generate_text` et `generate_json` : ils ignorent
complètement quel modèle répond derrière.

## Comparer les modèles

```bash
python -m app.bench ollama
python -m app.bench ollama:llama3.2:3b
```

Six cas identiques sur chaque modèle : trois classements d'intention, deux extractions d'action,
une rédaction. Quatre mesures — précision, temps, qualité de forme, succès. Le tableau produit se
colle directement dans un rapport.

Également exposé en API : `POST /api/bench/run` avec `{"targets": ["ollama"]}`.

## Actions sur le calendrier

Le graphe aiguille vers `agir` dès qu'un verbe d'action est détecté :

```
                ┌──▶ agir ─────────────────┐
comprendre ─────┤                          ├──▶ fin
                └──▶ extraire ─▶ présenter ┘
```

`agir` ne touche jamais Google : il prépare une action, vérifie qu'elle est légitime, et renvoie
une proposition que le front-end exécute après confirmation explicite.

Deux règles non négociables :

* **un conflit bloque la création** — on avertit, on propose le premier créneau libre, on ne crée
  rien ;
* **une suppression ambiguë ne supprime rien** — si plusieurs événements correspondent, on les
  liste et on demande de préciser.

---

## Importer un calendrier depuis une image ou un PDF

`POST /api/import/analyze` (multipart, champ `file`) → liste d'événements détectés.
`GET /api/import/capabilities` → le modèle configuré sait-il lire une image ?

Deux chemins, choisis automatiquement :

| Document | Chemin | Modèles compatibles |
| --- | --- | --- |
| PDF avec texte sélectionnable | `pypdf` extrait le texte, puis lecture par le modèle | **tous**, même llama3.2:3b |
| Image, ou PDF scanné | envoi direct au modèle de vision | modèles multimodaux Ollama (`qwen2.5vl`, `llava`…) — llama3.2:3b ne l'est pas |

**Rien n'est inventé.** Chaque champ absent ou incohérent est renvoyé vide et listé dans
`aVerifier`. Une heure de fin antérieure au début est effacée plutôt que corrigée en silence. Une
date sans année est complétée avec l'année courante *et* signalée comme à vérifier — l'utilisateur
tranche.

L'API ne crée **aucun** événement : elle décrit ce qu'elle a lu. C'est le front-end qui écrit dans
Google Calendar, après correction et confirmation.

---

## Fuseau horaire

Le navigateur transmet son fuseau IANA (`Intl.DateTimeFormat().resolvedOptions().timeZone`) à
chaque appel. Le back-end ramène immédiatement tous les horodatages reçus dans ce fuseau, avant
tout calcul.

Sans cela, la chaîne était fausse d'un bout à l'autre : Google renvoie `10:15+01:00`, le front-end
normalise en `09:15Z`, et le back-end lisait 09:15. L'agent annonçait une heure décalée, comparait
les conflits sur de mauvaises bornes, et créait les événements une heure trop tôt.

Trois règles en découlent :

* une heure demandée (« à 15 h ») est toujours une heure **locale** ;
* « aujourd'hui » est la date **chez l'utilisateur**, pas celle du serveur ;
* les horodatages renvoyés portent leur décalage (`2026-08-11T15:00:00+01:00`).

Si le fuseau est absent ou inconnu, le repli est `Europe/Paris`, puis `UTC`, puis `timezone.utc` —
un décalage fixe qui ne dépend d'aucune base de données et ne peut donc jamais échouer.

**Windows** : `zoneinfo` fait partie de la bibliothèque standard mais s'appuie sur la base de
fuseaux du système, que Windows ne fournit pas. D'où le paquet `tzdata` dans `requirements.txt`,
installé uniquement sur cette plateforme. Sans lui, l'agent bascule sur UTC au lieu de planter.

Couvert par `tests/test_fuseau.py`, y compris le cas d'une machine sans base de fuseaux.
