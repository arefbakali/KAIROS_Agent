"""Traduction d'une demande en langage naturel vers une plage de dates.

Ce module ne fait appel à aucun modèle : c'est le filet de sécurité. Le nœud
`resoudre_periode` interroge d'abord Qwen3, puis valide sa réponse ici. Si le
modèle se trompe de siècle ou renvoie une plage absurde, les règles ci-dessous
reprennent la main.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from datetime import date, timedelta

MOIS = {
    "janvier": 1, "fevrier": 2, "mars": 3, "avril": 4, "mai": 5, "juin": 6,
    "juillet": 7, "aout": 8, "septembre": 9, "octobre": 10, "novembre": 11, "decembre": 12,
}

JOURS = {
    "lundi": 0, "mardi": 1, "mercredi": 2, "jeudi": 3,
    "vendredi": 4, "samedi": 5, "dimanche": 6,
}

JOURS_FR = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
MOIS_FR = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]

# Au-delà, on n'agrège plus jour par jour mais semaine par semaine.
SEUIL_DETAIL_JOURNALIER = 16
# Garde-fou : une plage plus longue n'apporte rien et gonfle le prompt.
DUREE_MAX = 400


@dataclass(frozen=True)
class Periode:
    debut: date
    fin: date  # incluse
    libelle: str

    @property
    def nb_jours(self) -> int:
        return (self.fin - self.debut).days + 1

    @property
    def detaille_par_jour(self) -> bool:
        return self.nb_jours <= SEUIL_DETAIL_JOURNALIER


def normaliser(texte: str) -> str:
    sans_accent = unicodedata.normalize("NFD", texte.lower())
    return "".join(c for c in sans_accent if unicodedata.category(c) != "Mn")


def jour_fr(jour: date) -> str:
    return JOURS_FR[jour.weekday()]


def libelle_jour(jour: date) -> str:
    return f"{jour_fr(jour)} {jour.day} {MOIS_FR[jour.month - 1]}"


def _semaine(reference: date, decalage: int = 0) -> Periode:
    lundi = reference - timedelta(days=reference.weekday()) + timedelta(weeks=decalage)
    libelles = {0: "cette semaine", 1: "la semaine prochaine", -1: "la semaine dernière"}
    return Periode(lundi, lundi + timedelta(days=6), libelles.get(decalage, "cette semaine"))


def _mois(reference: date, decalage: int = 0) -> Periode:
    mois = reference.month - 1 + decalage
    annee = reference.year + mois // 12
    mois = mois % 12 + 1
    debut = date(annee, mois, 1)
    fin = date(annee + (mois == 12), mois % 12 + 1, 1) - timedelta(days=1)
    libelles = {0: "ce mois-ci", 1: "le mois prochain", -1: "le mois dernier"}
    return Periode(debut, fin, libelles.get(decalage, f"{MOIS_FR[mois - 1]} {annee}"))


def _un_jour(jour: date, libelle: str | None = None) -> Periode:
    return Periode(jour, jour, libelle or libelle_jour(jour))


def _date_sure(annee: int, mois: int, jour: int) -> date | None:
    """Date valide, ou None : « 31 février » ne doit pas faire tomber l'agent."""
    try:
        return date(annee, mois, jour)
    except ValueError:
        return None


def resoudre(message: str, aujourdhui: date, couverture: tuple[date, date] | None = None) -> Periode:
    """Déduit la période visée. Retombe sur la journée du jour si rien n'est reconnu."""
    texte = normaliser(message)

    # --- Vue globale : tout ce que le calendrier contient -------------------
    if any(
        mot in texte
        for mot in (
            "tout mon calendrier", "tout le calendrier", "vue globale", "vue d'ensemble",
            "vue densemble", "globalement", "en general", "tout ce que j'ai",
            "tout ce que jai", "l'ensemble", "lensemble", "toutes mes",
        )
    ):
        if couverture:
            return Periode(couverture[0], couverture[1], "l'ensemble de votre calendrier")
        return Periode(aujourdhui - timedelta(days=30), aujourdhui + timedelta(days=90),
                       "l'ensemble de votre calendrier")

    # --- Repères relatifs simples ------------------------------------------
    if "avant-hier" in texte or "avant hier" in texte:
        return _un_jour(aujourdhui - timedelta(days=2), "avant-hier")
    if "apres-demain" in texte or "apres demain" in texte:
        return _un_jour(aujourdhui + timedelta(days=2), "après-demain")
    if "aujourd" in texte or "ma journee" in texte or "la journee" in texte:
        return _un_jour(aujourdhui, "aujourd'hui")
    if "demain" in texte:
        return _un_jour(aujourdhui + timedelta(days=1), "demain")
    if "hier" in texte:
        return _un_jour(aujourdhui - timedelta(days=1), "hier")

    # --- « les 3 prochains jours », « les deux semaines à venir » ------------
    # Placé avant les repères « semaine » / « mois », qui capteraient sinon la
    # quantité. Les mots intercalés (« prochains ») sont tolérés.
    chiffres = {
        "un": 1, "une": 1, "deux": 2, "trois": 3, "quatre": 4, "cinq": 5,
        "six": 6, "sept": 7, "huit": 8, "neuf": 9, "dix": 10, "quinze": 15,
    }
    duree = re.search(
        r"(\d+|" + "|".join(chiffres) + r")\s+(?:[a-z']+\s+){0,2}?(jours?|semaines?)", texte
    )
    if duree:
        brut = duree.group(1)
        quantite = int(brut) if brut.isdigit() else chiffres[brut]
        par_semaine = duree.group(2).startswith("semaine")
        jours = max(1, min(quantite * (7 if par_semaine else 1), DUREE_MAX))
        unite = "semaines" if par_semaine else "jours"
        vers_le_passe = any(mot in texte for mot in ("dernier", "derniere", "passe", "ecoule"))
        if vers_le_passe:
            return Periode(aujourdhui - timedelta(days=jours - 1), aujourdhui,
                           f"les {quantite} {unite} écoulés")
        return Periode(aujourdhui, aujourdhui + timedelta(days=jours - 1),
                       f"les {quantite} prochain{'es' if par_semaine else 's'} {unite}")

    # --- Semaines et mois ---------------------------------------------------
    if "semaine prochaine" in texte or "la semaine qui vient" in texte or "semaine suivante" in texte:
        return _semaine(aujourdhui, 1)
    if "semaine derniere" in texte or "semaine passee" in texte:
        return _semaine(aujourdhui, -1)
    if "semaine" in texte:
        return _semaine(aujourdhui, 0)
    if "mois prochain" in texte:
        return _mois(aujourdhui, 1)
    if "mois dernier" in texte:
        return _mois(aujourdhui, -1)
    if "mois" in texte:
        return _mois(aujourdhui, 0)

    # --- Date explicite : 12/08, 12-08-2026, 12 août ------------------------
    # Format ISO d'abord : sans cela, « 2026-10-01 » serait lu comme 10 janvier.
    iso = re.search(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b", texte)
    if iso:
        cible = _date_sure(int(iso.group(1)), int(iso.group(2)), int(iso.group(3)))
        if cible:
            return _un_jour(cible)

    numerique = re.search(r"\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b", texte)
    if numerique:
        jour, mois = int(numerique.group(1)), int(numerique.group(2))
        annee = int(numerique.group(3) or aujourdhui.year)
        if annee < 100:
            annee += 2000
        try:
            return _un_jour(date(annee, mois, jour))
        except ValueError:
            pass

    litterale = re.search(r"\b(\d{1,2})(?:er)?\s+(" + "|".join(MOIS) + r")\b", texte)
    if litterale:
        jour = int(litterale.group(1))
        mois = MOIS[litterale.group(2)]
        annee = aujourdhui.year
        annee_match = re.search(r"\b(20\d{2})\b", texte)
        if annee_match:
            annee = int(annee_match.group(1))
        try:
            return _un_jour(date(annee, mois, jour))
        except ValueError:
            pass

    # --- Nom de jour seul : « mardi », « le vendredi » ----------------------
    for nom, index in JOURS.items():
        if re.search(rf"\b{nom}\b", texte):
            ecart = (index - aujourdhui.weekday()) % 7
            if "dernier" in texte or "passe" in texte:
                cible = aujourdhui - timedelta(days=(aujourdhui.weekday() - index) % 7 or 7)
            else:
                cible = aujourdhui + timedelta(days=ecart)
            return _un_jour(cible)

    return _un_jour(aujourdhui, "aujourd'hui")


def valider(debut: date, fin: date, libelle: str, aujourdhui: date) -> Periode | None:
    """Contrôle une plage proposée par le modèle avant de lui faire confiance."""
    if fin < debut:
        debut, fin = fin, debut
    if (fin - debut).days + 1 > DUREE_MAX:
        return None
    # Un modèle qui part à dix ans d'ici s'est trompé de repère temporel.
    if abs((debut - aujourdhui).days) > 3 * 365 or abs((fin - aujourdhui).days) > 3 * 365:
        return None
    return Periode(debut, fin, libelle.strip() or "la période demandée")
