"""Import d'un calendrier depuis une image ou un PDF.

Deux chemins, choisis automatiquement :

* **PDF avec texte sélectionnable** → le texte est extrait par `pypdf`, puis lu
  par n'importe quel modèle, même non multimodal. C'est le cas le plus courant
  pour un emploi du temps exporté.
* **Image, ou PDF scanné** → le document est envoyé tel quel à un modèle de
  vision (installé via Ollama). llama3.2:3b (le modèle par défaut) est texte
  seul et ne prend pas ce chemin.

Règle absolue : **rien n'est inventé**. Chaque champ manquant ou douteux est
signalé à l'utilisateur au lieu d'être comblé. Un horaire deviné est pire qu'un
horaire absent, parce qu'il ne se voit pas.
"""

from __future__ import annotations

import io
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from pypdf import PdfReader

from app.llm import LLMUnavailable, current_provider, extract_json
from app.llm.base import Piece

MIMES_IMAGE = {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/heic", "image/gif"}
MIME_PDF = "application/pdf"
TAILLE_MAX = 12 * 1024 * 1024  # 12 Mo

SCHEMA = {
    "type": "object",
    "properties": {
        "evenements": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "titre": {"type": "string"},
                    "date": {"type": "string", "description": "AAAA-MM-JJ, ou vide si illisible"},
                    "heure_debut": {"type": "string", "description": "HH:MM, ou vide"},
                    "heure_fin": {"type": "string", "description": "HH:MM, ou vide"},
                    "description": {"type": "string"},
                    "lieu": {"type": "string"},
                },
                "required": ["titre"],
            },
        }
    },
    "required": ["evenements"],
}

SYSTEM = (
    "Tu lis un calendrier, un emploi du temps ou un planning et tu en extrais les événements. "
    "RÈGLE ABSOLUE : n'invente jamais une information. Si une date, une heure, un lieu ou une "
    "description n'apparaît pas clairement dans le document, laisse le champ vide. "
    "Ne complète pas une heure de fin que tu n'as pas lue. "
    "Les dates sont au format AAAA-MM-JJ, les heures au format HH:MM sur 24 heures. "
    "Si l'année n'apparaît nulle part dans le document, laisse-la telle que tu la déduis du "
    "contexte, ou laisse la date vide. "
    "Tu réponds uniquement en JSON."
)


@dataclass
class EvenementDetecte:
    """Un événement lu dans le document, avec ce qui reste à vérifier."""

    titre: str
    date: str | None = None
    heure_debut: str | None = None
    heure_fin: str | None = None
    description: str | None = None
    lieu: str | None = None
    #: Champs à faire confirmer par l'utilisateur avant tout import.
    aVerifier: list[str] = field(default_factory=list)
    complet: bool = False

    def to_dict(self) -> dict:
        return {
            "titre": self.titre,
            "date": self.date,
            "heureDebut": self.heure_debut,
            "heureFin": self.heure_fin,
            "description": self.description,
            "lieu": self.lieu,
            "aVerifier": self.aVerifier,
            "complet": self.complet,
        }


def _texte_pdf(data: bytes) -> str:
    """Texte d'un PDF, vide s'il s'agit d'un scan sans couche texte."""
    try:
        lecteur = PdfReader(io.BytesIO(data))
        morceaux = [page.extract_text() or "" for page in lecteur.pages[:20]]
    except Exception:  # noqa: BLE001 — un PDF corrompu ne doit pas tout arrêter
        return ""
    return "\n".join(morceaux).strip()


_HEURE = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)$")


def _valider_heure(brut: str | None) -> str | None:
    if not brut:
        return None
    nettoye = brut.strip().replace("h", ":").replace(" ", "")
    if nettoye.endswith(":"):
        nettoye += "00"
    if ":" not in nettoye and nettoye.isdigit() and len(nettoye) <= 2:
        nettoye = f"{int(nettoye):02d}:00"
    correspondance = _HEURE.match(nettoye)
    if not correspondance:
        return None
    return f"{int(correspondance.group(1)):02d}:{correspondance.group(2)}"


def _valider_date(brut: str | None, aujourdhui: date) -> str | None:
    """Date au format AAAA-MM-JJ, ou None. Aucune date n'est devinée."""
    if not brut:
        return None
    texte = brut.strip()

    correspondance = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})$", texte)
    if correspondance:
        try:
            return date(
                int(correspondance.group(1)),
                int(correspondance.group(2)),
                int(correspondance.group(3)),
            ).isoformat()
        except ValueError:
            return None

    # « 12/08 » ou « 12/08/2026 » : sans année, on prend l'année courante et on
    # le signalera comme à vérifier.
    correspondance = re.match(r"^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$", texte)
    if correspondance:
        annee = correspondance.group(3)
        valeur = int(annee) if annee else aujourdhui.year
        if valeur < 100:
            valeur += 2000
        try:
            return date(valeur, int(correspondance.group(2)), int(correspondance.group(1))).isoformat()
        except ValueError:
            return None

    return None


def _normaliser(brut: dict, aujourdhui: date) -> EvenementDetecte | None:
    titre = str(brut.get("titre") or "").strip()
    if not titre:
        return None

    evenement = EvenementDetecte(titre=titre[:120])
    evenement.date = _valider_date(str(brut.get("date") or ""), aujourdhui)
    evenement.heure_debut = _valider_heure(str(brut.get("heure_debut") or ""))
    evenement.heure_fin = _valider_heure(str(brut.get("heure_fin") or ""))
    evenement.description = (str(brut.get("description") or "").strip() or None)
    evenement.lieu = (str(brut.get("lieu") or "").strip() or None)

    if not evenement.date:
        evenement.aVerifier.append("date")
    elif not re.match(r"^\d{4}-", str(brut.get("date") or "")):
        # L'année n'était pas dans le document : elle a été supposée.
        evenement.aVerifier.append("date")

    if not evenement.heure_debut:
        evenement.aVerifier.append("heureDebut")
    if not evenement.heure_fin:
        evenement.aVerifier.append("heureFin")

    # Fin avant début : incohérent, on ne corrige pas en silence.
    if evenement.heure_debut and evenement.heure_fin and evenement.heure_fin <= evenement.heure_debut:
        evenement.aVerifier.append("heureFin")
        evenement.heure_fin = None

    evenement.complet = not evenement.aVerifier
    return evenement


async def analyser(data: bytes, mime: str, nom: str, aujourdhui: date | None = None) -> dict:
    """Analyse un document et renvoie les événements détectés."""
    aujourdhui = aujourdhui or date.today()

    if len(data) > TAILLE_MAX:
        raise ValueError("Le fichier dépasse 12 Mo. Réduisez la taille de l'image ou du PDF.")

    mime = (mime or "").lower()
    if mime not in MIMES_IMAGE and mime != MIME_PDF:
        raise ValueError(
            f"Format « {mime or 'inconnu'} » non pris en charge. "
            "Envoyez une image PNG ou JPEG, ou un PDF."
        )

    fournisseur = current_provider()
    consigne = (
        "Repère tous les événements de ce document et renvoie-les en JSON. "
        f"Pour information, la date du jour est le {aujourdhui.isoformat()} : utilise-la "
        "uniquement pour déduire l'année si le document ne la précise pas."
    )

    source = "vision"
    texte = _texte_pdf(data) if mime == MIME_PDF else ""

    if texte and len(texte) > 40:
        # Chemin texte : fonctionne avec n'importe quel modèle, même local.
        source = "texte-pdf"
        brut = await fournisseur.chat(
            SYSTEM,
            f"{consigne}\n\nContenu du document :\n\n{texte[:12000]}",
            schema=SCHEMA,
            max_tokens=2000,
        )
    else:
        if not fournisseur.supports_vision:
            raise LLMUnavailable(
                f"Le modèle « {fournisseur.label()} » ne sait pas lire d'image. "
                "Les PDF avec du texte sélectionnable continuent de fonctionner. "
                "Pour lire une image ou un PDF scanné, installez un modèle multimodal "
                "(« ollama pull qwen2.5vl:7b » puis LLM_MODEL=qwen2.5vl:7b)."
            )
        brut = await fournisseur.chat_vision(
            SYSTEM, consigne, [Piece(data, mime, nom)], schema=SCHEMA, max_tokens=2000
        )

    try:
        donnees = extract_json(brut)
    except ValueError as erreur:
        raise LLMUnavailable(
            "Le modèle n'a pas renvoyé de résultat exploitable. Réessayez avec une image "
            "plus nette, ou un autre modèle."
        ) from erreur

    liste = donnees.get("evenements") if isinstance(donnees, dict) else donnees
    if not isinstance(liste, list):
        liste = []

    evenements = [
        detecte
        for detecte in (_normaliser(item, aujourdhui) for item in liste if isinstance(item, dict))
        if detecte is not None
    ]

    return {
        "source": source,
        "model": fournisseur.label(),
        "fileName": nom,
        "events": [e.to_dict() for e in evenements],
        "needsReview": sum(1 for e in evenements if e.aVerifier),
    }


def creneau(date_iso: str, debut: str, fin: str | None, defaut_minutes: int = 60) -> tuple[str, str]:
    """Convertit date + heures en bornes ISO, pour la création dans Google."""
    depart = datetime.fromisoformat(f"{date_iso}T{debut}:00")
    if fin:
        arrivee = datetime.fromisoformat(f"{date_iso}T{fin}:00")
        if arrivee > depart:
            return depart.isoformat(), arrivee.isoformat()
    return depart.isoformat(), (depart + timedelta(minutes=defaut_minutes)).isoformat()
