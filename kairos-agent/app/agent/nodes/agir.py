"""Nœud « agir » — création et suppression d'événements.

L'agent ne touche jamais lui-même à Google Calendar : le jeton OAuth vit dans
le navigateur. Ce nœud prépare une action, vérifie qu'elle est légitime, et
renvoie une proposition que le front-end exécutera après confirmation
explicite de l'utilisateur.

Deux règles non négociables :

* **Un conflit bloque la création.** On avertit, on propose une alternative, on
  ne crée rien.
* **Une suppression ambiguë ne supprime rien.** Si plusieurs événements
  correspondent, on demande à l'utilisateur de choisir.
"""

from __future__ import annotations

import unicodedata
from datetime import date, datetime, time, timedelta

from app.agent.fuseau import resoudre_zone
from app.agent.horaire import DUREE_DEFAUT, lire_duree, lire_heure, nettoyer_titre
from app.agent.periode import libelle_jour
from app.agent.state import AgentState
from app.llm import LLMUnavailable, generate_json
from app.schemas import CalendarEvent

SCHEMA = {
    "type": "object",
    "properties": {
        "action": {"type": "string", "enum": ["creer", "supprimer", "aucune"]},
        "titre": {"type": "string"},
        "heure": {"type": "string", "description": "Format HH:MM, ou vide si absent."},
        "duree_minutes": {"type": "integer"},
    },
    "required": ["action", "titre"],
}

SYSTEM = (
    "Tu extrais l'intention d'action d'une phrase concernant un agenda. "
    "Tu ne calcules aucune date : un autre module s'en charge. "
    "Le titre doit être court et sans mention d'horaire. "
    "Tu réponds en français."
)

#: Bornes de la journée ouvrée, pour proposer une alternative crédible.
OUVERTURE = time(8, 0)
FERMETURE = time(20, 0)


async def agir(state: AgentState) -> AgentState:
    message = (state.get("message") or "").strip()
    intent = state.get("intent", "")
    periode = state["periode"]
    events: list[CalendarEvent] = state.get("events", [])
    zone = state.get("zone") or resoudre_zone(None)
    jour: date = periode.debut
    pending = state.get("pending_action")

    # --- Compléter une création incomplète depuis le pending ----------------
    if pending and pending.get("type") == "creation_incomplete":
        heure = lire_heure(message)
        if heure:
            titre = pending.get("titre") or nettoyer_titre(
                pending.get("message", "")
            )
            duree = lire_duree(message)
            jour_str = pending.get("jour")
            if jour_str:
                jour = date.fromisoformat(jour_str)
            return _creer(events, jour, heure, duree, titre, zone)

    # --- Compléter une suppression ambiguë depuis le pending ----------------
    if pending and pending.get("type") == "suppression_ambigue":
        # L'utilisateur précise : chercher dans les événements du jour.
        titre = nettoyer_titre(message)
        return _supprimer(events, jour, None, f"{titre} {message}")

    # --- Ce que dit la phrase, lu en Python ---------------------------------
    heure = lire_heure(message)
    duree = lire_duree(message)
    titre = nettoyer_titre(message)
    # On garde les mots de l'utilisateur : pour retrouver un événement à
    # supprimer, ils sont plus fiables que le titre reformulé par le modèle.
    titre_utilisateur = titre

    # --- Le modèle affine le titre, sans toucher aux horaires ---------------
    try:
        data = await generate_json(SYSTEM, f"Phrase : « {message} »", SCHEMA)
        propose = str(data.get("titre", "")).strip()
        if propose and len(propose) < 90:
            titre = propose
        if not heure:
            brut = str(data.get("heure", "")).strip()
            if ":" in brut:
                h, m = brut.split(":")[:2]
                if h.isdigit() and m.isdigit() and int(h) < 24 and int(m) < 60:
                    heure = (int(h), int(m))
        if not titre and data.get("action") == "creer":
            titre = "Nouvel événement"
    except (LLMUnavailable, ValueError):
        pass  # Les règles Python suffisent à traiter la demande.

    titre = titre or "Nouvel événement"

    if intent == "supprimer_evenement":
        return _supprimer(events, jour, heure, f"{titre_utilisateur} {titre}")
    return _creer(events, jour, heure, duree, titre, zone)


# --------------------------------------------------------------------------
# Création
# --------------------------------------------------------------------------


def _creer(
    events: list[CalendarEvent],
    jour: date,
    heure: tuple[int, int] | None,
    duree: int,
    titre: str,
    zone,
) -> AgentState:
    if heure is None:
        return _blocs(
            [
                {
                    "type": "avertissement",
                    "title": "Il manque une heure",
                    "content": (
                        f"Je peux créer « {titre} » le {libelle_jour(jour)}, mais aucune heure "
                        "n'est indiquée. Précisez par exemple : « à 15 h pendant une heure »."
                    ),
                }
            ],
            action="creation_incomplete",
        )

    # L'heure demandée est une heure locale : « 15h » veut dire 15h chez
    # l'utilisateur, quel que soit le fuseau du serveur.
    debut = datetime.combine(jour, time(heure[0], heure[1]), tzinfo=zone)
    fin = debut + timedelta(minutes=duree or DUREE_DEFAUT)

    conflits = [e for e in events if e.start < fin and debut < e.end]

    if conflits:
        alternative = _premier_creneau_libre(events, jour, debut, fin - debut, zone)
        detail = " ; ".join(
            f"« {e.title} » de {e.start.strftime('%H:%M')} à {e.end.strftime('%H:%M')}"
            for e in conflits[:3]
        )
        blocs: list[dict] = [
            {
                "type": "avertissement",
                "title": "Conflit détecté — rien n'a été créé",
                "content": (
                    f"Le créneau {debut.strftime('%H:%M')} – {fin.strftime('%H:%M')} du "
                    f"{libelle_jour(jour)} chevauche déjà : {detail}."
                ),
            }
        ]
        if alternative:
            autre_fin = alternative + (fin - debut)
            blocs.append(
                {
                    "type": "action-creer",
                    "title": titre,
                    "start": alternative.isoformat(),
                    "end": autre_fin.isoformat(),
                    "question": (
                        f"Voulez-vous plutôt « {titre} » de {alternative.strftime('%H:%M')} "
                        f"à {autre_fin.strftime('%H:%M')} ?"
                    ),
                    "confirmLabel": "Créer à cette heure",
                    # Le créneau initialement demandé, conservé pour ne le créer
                    # que si l'utilisateur choisit explicitement de passer outre
                    # le conflit (bouton « malgré le conflit » côté front-end).
                    "conflict": True,
                    "originalStart": debut.isoformat(),
                    "originalEnd": fin.isoformat(),
                    "forceLabel": "Créer malgré le conflit",
                }
            )
        else:
            blocs.append(
                {
                    "type": "resultat",
                    "status": "echec",
                    "content": (
                        "Aucun créneau libre de cette durée ce jour-là entre 8 h et 20 h. "
                        "Choisissez un autre jour ou libérez un rendez-vous."
                    ),
                }
            )
        return _blocs(blocs, action="conflit")

    return _blocs(
        [
            {
                "type": "action-creer",
                "title": titre,
                "start": debut.isoformat(),
                "end": fin.isoformat(),
                "question": (
                    f"Créer « {titre} » le {libelle_jour(jour)} de "
                    f"{debut.strftime('%H:%M')} à {fin.strftime('%H:%M')} ?"
                ),
                "confirmLabel": "Créer dans Google Calendar",
            }
        ],
        action="creation_proposee",
    )


def _premier_creneau_libre(
    events: list[CalendarEvent], jour: date, apres: datetime, duree: timedelta, tz
) -> datetime | None:
    """Premier créneau libre du jour, à partir de l'heure demandée."""
    du_jour = sorted(
        (e for e in events if e.start.date() == jour), key=lambda e: e.start
    )
    curseur = apres
    limite = datetime.combine(jour, FERMETURE, tzinfo=tz)

    for event in du_jour:
        if event.end <= curseur:
            continue
        if event.start - curseur >= duree:
            return curseur
        curseur = max(curseur, event.end)

    return curseur if curseur + duree <= limite else None


# --------------------------------------------------------------------------
# Suppression
# --------------------------------------------------------------------------


def _supprimer(
    events: list[CalendarEvent],
    jour: date,
    heure: tuple[int, int] | None,
    titre: str,
) -> AgentState:
    candidats = [e for e in events if e.start.date() == jour]

    # Une heure explicite est une contrainte, pas une préférence : si rien ne
    # correspond, on le dit plutôt que de supprimer un autre événement.
    if heure is not None:
        candidats = [e for e in candidats if (e.start.hour, e.start.minute) == heure]

    mots = [m for m in _mots_cles(titre) if len(m) > 3]
    if mots and len(candidats) > 1:
        filtres = [
            e for e in candidats if any(m in _sans_accent(e.title.lower()) for m in mots)
        ]
        if filtres:
            candidats = filtres

    if not candidats:
        return _blocs(
            [
                {
                    "type": "resultat",
                    "status": "echec",
                    "content": (
                        f"Aucun événement trouvé le {libelle_jour(jour)}"
                        + (f" à {heure[0]:02d}:{heure[1]:02d}" if heure else "")
                        + ". Rien n'a été supprimé."
                    ),
                }
            ],
            action="suppression_introuvable",
        )

    if len(candidats) > 1:
        liste = "\n".join(
            f"• {e.title} — {e.start.strftime('%H:%M')} à {e.end.strftime('%H:%M')}"
            for e in candidats[:6]
        )
        return _blocs(
            [
                {
                    "type": "avertissement",
                    "title": "Demande ambiguë — rien n'a été supprimé",
                    "content": (
                        f"{len(candidats)} événements correspondent le {libelle_jour(jour)} :\n"
                        f"{liste}\n\nPrécisez l'heure ou le titre exact."
                    ),
                }
            ],
            action="suppression_ambigue",
        )

    cible = candidats[0]
    return _blocs(
        [
            {
                "type": "action-supprimer",
                "eventId": cible.id,
                "title": cible.title,
                "start": cible.start.isoformat(),
                "end": cible.end.isoformat(),
                "question": (
                    f"Supprimer « {cible.title} », le {libelle_jour(jour)} de "
                    f"{cible.start.strftime('%H:%M')} à {cible.end.strftime('%H:%M')} ?"
                ),
                "confirmLabel": "Supprimer de Google Calendar",
            }
        ],
        action="suppression_proposee",
    )


def _mots_cles(titre: str) -> list[str]:
    """Mots porteurs de sens, sans accent, pour comparer des intitulés.

    « réunion » doit être écarté comme « reunion » : sans normalisation, un
    titre générique renvoyé par le modèle suffirait à lever une ambiguïté qui
    n'en est pas une — et donc à supprimer le mauvais événement.
    """
    vides = {
        "reunion", "reunions", "rendez", "vous", "evenement", "evenements",
        "meeting", "avec", "pour", "mon", "ma", "mes", "le", "la", "les", "du",
        "de", "des", "un", "une", "nouvel", "nouvelle",
    }
    mots = [_sans_accent(m.strip(".,;:'\"").lower()) for m in titre.split()]
    return [m for m in mots if m and m not in vides]


def _sans_accent(texte: str) -> str:
    decompose = unicodedata.normalize("NFD", texte)
    return "".join(c for c in decompose if unicodedata.category(c) != "Mn")


def _blocs(blocks: list[dict], action: str) -> AgentState:
    return {"blocks": blocks, "action": action, "degraded": False, "degraded_reason": None}
