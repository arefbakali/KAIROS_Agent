"""Banc d'essai : les mêmes prompts, sur plusieurs modèles.

Volontairement simple. Quatre mesures par cas :

* **précision** — la réponse contient-elle ce qu'on attend, et rien de faux ?
* **temps**     — secondes écoulées
* **qualité**   — français correct, longueur raisonnable, pas de Markdown ni de
                  balises de réflexion résiduelles
* **succès**    — le modèle a-t-il répondu sans erreur ni format invalide ?

Chaque cas porte sa propre fonction de contrôle : rien n'est jugé « à l'œil ».
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Callable

from app.llm import LLMUnavailable, build_provider, extract_json


@dataclass
class Cas:
    nom: str
    system: str
    user: str
    schema: dict[str, Any] | None = None
    #: Reçoit la réponse (texte ou objet JSON) et renvoie (précision 0→1, note).
    controle: Callable[[Any], tuple[float, str]] = field(default=lambda r: (1.0, ""))


# --------------------------------------------------------------------------
# Contrôles
# --------------------------------------------------------------------------


def _intention(attendue: str):
    def verifier(reponse: Any) -> tuple[float, str]:
        if not isinstance(reponse, dict):
            return 0.0, "réponse non structurée"
        obtenue = str(reponse.get("intention", "")).strip()
        if obtenue == attendue:
            return 1.0, ""
        return 0.0, f"intention « {obtenue or 'vide'} » au lieu de « {attendue} »"

    return verifier


def _action(attendue: str, mot_titre: str | None = None):
    def verifier(reponse: Any) -> tuple[float, str]:
        if not isinstance(reponse, dict):
            return 0.0, "réponse non structurée"
        score, notes = 0.0, []
        if str(reponse.get("action", "")).strip() == attendue:
            score += 0.6
        else:
            notes.append(f"action « {reponse.get('action')} »")
        titre = str(reponse.get("titre", "")).lower()
        if mot_titre is None or mot_titre in titre:
            score += 0.4
        else:
            notes.append(f"titre « {titre} »")
        return score, " ; ".join(notes)

    return verifier


def _resume_fidele(reponse: Any) -> tuple[float, str]:
    """Le modèle ne doit citer que les chiffres qu'on lui a donnés."""
    texte = str(reponse).lower()
    autorises = {"3", "trois", "14", "15", "9", "10", "30", "2"}
    interdits = [n for n in ("4", "5", "6", "7", "8", "quatre", "cinq") if n in texte]
    score = 1.0
    notes = []
    if interdits:
        score -= 0.5
        notes.append(f"chiffres inventés : {', '.join(interdits)}")
    if not any(mot in texte for mot in autorises):
        score -= 0.3
        notes.append("aucun fait repris")
    return max(score, 0.0), " ; ".join(notes)


# --------------------------------------------------------------------------
# Les cas
# --------------------------------------------------------------------------

INTENTS = [
    "resumer",
    "lister_evenements",
    "prochain_evenement",
    "temps_libre",
    "charge_de_travail",
    "conflits",
    "creer_evenement",
    "supprimer_evenement",
    "autre",
]

SCHEMA_INTENTION = {
    "type": "object",
    "properties": {
        "intention": {"type": "string", "enum": INTENTS},
        "raison": {"type": "string"},
    },
    "required": ["intention", "raison"],
}

SCHEMA_ACTION = {
    "type": "object",
    "properties": {
        "action": {"type": "string", "enum": ["creer", "supprimer", "aucune"]},
        "titre": {"type": "string"},
        "heure": {"type": "string"},
        "duree_minutes": {"type": "integer"},
    },
    "required": ["action", "titre"],
}

SYSTEM_INTENTION = (
    "Tu classes une demande d'agenda dans une seule catégorie parmi : "
    + ", ".join(INTENTS)
    + ". Tu ignores les dates. Tu réponds en français."
)

SYSTEM_ACTION = (
    "Tu extrais l'intention d'action d'une phrase concernant un agenda. "
    "Le titre doit être court et sans mention d'horaire. Tu réponds en français."
)

SYSTEM_RESUME = (
    "Tu es KAIROS, un agent d'organisation. Tu réponds en français, en deux phrases "
    "maximum. RÈGLE ABSOLUE : n'invente aucun chiffre ni horaire. "
    "Pas de Markdown, pas de liste."
)

CAS: list[Cas] = [
    Cas(
        "intention · résumé",
        SYSTEM_INTENTION,
        "Demande : « résume-moi ma semaine »",
        SCHEMA_INTENTION,
        _intention("resumer"),
    ),
    Cas(
        "intention · créneau libre",
        SYSTEM_INTENTION,
        "Demande : « trouve-moi deux heures de libre »",
        SCHEMA_INTENTION,
        _intention("temps_libre"),
    ),
    Cas(
        "intention · conflits",
        SYSTEM_INTENTION,
        "Demande : « est-ce que j'ai des rendez-vous qui se chevauchent ? »",
        SCHEMA_INTENTION,
        _intention("conflits"),
    ),
    Cas(
        "action · création",
        SYSTEM_ACTION,
        "Phrase : « Crée une réunion budget demain à 15h pendant une heure. »",
        SCHEMA_ACTION,
        _action("creer", "budget"),
    ),
    Cas(
        "action · suppression",
        SYSTEM_ACTION,
        "Phrase : « Supprime ma réunion budget de demain à 15h. »",
        SCHEMA_ACTION,
        _action("supprimer", "budget"),
    ),
    Cas(
        "rédaction · fidélité aux faits",
        SYSTEM_RESUME,
        "Faits : 3 événements aujourd'hui, 2 h 30 d'occupation, prochain rendez-vous "
        "« Point projet » à 14:00, plage libre de 9:00 à 10:30.\n"
        "Rédige le résumé de la journée.",
        None,
        _resume_fidele,
    ),
]


# --------------------------------------------------------------------------
# Exécution
# --------------------------------------------------------------------------


def _qualite(texte: str, structure: bool) -> float:
    """Note de forme, entre 0 et 1."""
    if structure:
        return 1.0
    if not texte.strip():
        return 0.0
    note = 1.0
    if "```" in texte or "**" in texte or texte.strip().startswith("-"):
        note -= 0.3  # Markdown alors qu'on l'a interdit
    if "<think>" in texte:
        note -= 0.3  # balises de réflexion non nettoyées
    mots = len(texte.split())
    if mots > 120:
        note -= 0.2  # bien plus long que les deux phrases demandées
    if mots < 5:
        note -= 0.3
    if not any(c in texte for c in "éèêàçùô"):
        note -= 0.1  # probablement pas du français
    return max(note, 0.0)


async def evaluer(provider_nom: str, model: str | None = None) -> dict[str, Any]:
    """Passe tous les cas sur un modèle et renvoie le détail plus les moyennes."""
    fournisseur = build_provider(provider_nom, model)
    lignes = []

    for cas in CAS:
        depart = time.perf_counter()
        succes, precision, qualite, note = False, 0.0, 0.0, ""
        try:
            brut = await fournisseur.chat(cas.system, cas.user, schema=cas.schema, max_tokens=400)
            reponse: Any = extract_json(brut) if cas.schema else brut
            succes = True
            precision, note = cas.controle(reponse)
            qualite = _qualite(brut, bool(cas.schema))
        except LLMUnavailable as erreur:
            note = str(erreur)[:120]
        except ValueError:
            note = "JSON invalide"
            qualite = 0.0
        duree = time.perf_counter() - depart

        lignes.append(
            {
                "cas": cas.nom,
                "precision": round(precision, 2),
                "secondes": round(duree, 2),
                "qualite": round(qualite, 2),
                "succes": succes,
                "note": note,
            }
        )

    total = len(lignes) or 1
    return {
        "modele": fournisseur.label(),
        "cas": lignes,
        "precision": round(sum(l["precision"] for l in lignes) / total, 2),
        "secondes": round(sum(l["secondes"] for l in lignes) / total, 2),
        "qualite": round(sum(l["qualite"] for l in lignes) / total, 2),
        "succes": f"{sum(1 for l in lignes if l['succes'])}/{total}",
    }


def tableau_markdown(resultats: list[dict[str, Any]]) -> str:
    """Tableau prêt à coller dans un rapport."""
    lignes = [
        "| Modèle | Précision | Temps moyen | Qualité | Succès |",
        "| --- | ---: | ---: | ---: | ---: |",
    ]
    for r in resultats:
        lignes.append(
            f"| {r['modele']} | {r['precision']:.0%} | {r['secondes']:.2f} s | "
            f"{r['qualite']:.0%} | {r['succes']} |"
        )
    return "\n".join(lignes)
