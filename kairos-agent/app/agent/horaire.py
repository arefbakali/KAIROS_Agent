"""Lecture des heures et des durées dans une phrase française.

Comme pour les dates, tout est calculé en Python. Un modèle qui se trompe d'une
heure sur un rendez-vous est pire qu'un modèle qui ne répond pas : l'erreur est
invisible jusqu'au moment où l'utilisateur rate sa réunion.
"""

from __future__ import annotations

import re
import unicodedata

NOMBRES = {
    "une": 1,
    "un": 1,
    "deux": 2,
    "trois": 3,
    "quatre": 4,
    "cinq": 5,
    "six": 6,
    "sept": 7,
    "huit": 8,
    "neuf": 9,
    "dix": 10,
    "onze": 11,
    "midi": 12,
    "douze": 12,
    "treize": 13,
    "quatorze": 14,
    "quinze": 15,
    "seize": 16,
    "dix-sept": 17,
    "dix-huit": 18,
    "dix-neuf": 19,
    "vingt": 20,
}

DUREE_DEFAUT = 60


def _normaliser(texte: str) -> str:
    decompose = unicodedata.normalize("NFD", (texte or "").lower())
    return "".join(c for c in decompose if unicodedata.category(c) != "Mn")


#: Marqueur de durée suivi de la valeur reconnue par `lire_duree` — mêmes
#: alternatives qu'elle, pour ne retirer que ce qu'elle reconnaîtrait elle-même.
_DUREE_VALEUR = re.compile(
    r"\b(?:pendant|pour|d.une duree de|duree de|dure)\s+"
    r"(?:\d{1,3}\s*(?:min|minutes?)\b"
    r"|\d{1,2}\s*[h:]\s*\d{2}\b"
    r"|\d{1,2}\s*(?:h\b|heures?\b)"
    r"|(?:une\s+)?demi[- ]heure\b"
    r"|(?:" + "|".join(NOMBRES) + r")\s+heures?\b)"
)


def _sans_duree(texte_normalise: str) -> str:
    """Retire « pendant/pour <durée> » avant de chercher une heure.

    Indispensable : sans cela, « à 9 pendant 2 heures » lit le « 2 » de la
    durée comme si c'était l'heure demandée (toutes les heures du type
    « X heures » sont reconnues par le même motif, qu'il s'agisse d'un point
    dans le temps ou d'une durée — rien ne les distingue autrement).
    """
    return _DUREE_VALEUR.sub(" ", texte_normalise)


def lire_heure(texte: str) -> tuple[int, int] | None:
    """Première heure trouvée, sous forme (heures, minutes)."""
    t = _sans_duree(_normaliser(texte))

    # 15h30, 15 h 30, 15:30
    m = re.search(r"\b(\d{1,2})\s*[h:]\s*(\d{2})\b", t)
    if m:
        return _borner(int(m.group(1)), int(m.group(2)))

    # 15h, 15 h
    m = re.search(r"\b(\d{1,2})\s*h\b", t)
    if m:
        return _borner(int(m.group(1)), 0)

    # 15 heures
    m = re.search(r"\b(\d{1,2})\s*heures?\b", t)
    if m:
        return _borner(int(m.group(1)), 0)

    # « à 15 » : un nombre seul après « à », sans « h » ni « heures ».
    m = re.search(r"\b[àa]\s+(\d{1,2})\b", t)
    if m:
        return _borner(int(m.group(1)), 0)

    # « à quinze heures », « à midi »
    for mot, valeur in NOMBRES.items():
        if re.search(rf"\ba\s+{mot}\b", t) or re.search(rf"\b{mot}\s+heures?\b", t):
            return _borner(valeur, 0)

    return None


def lire_duree(texte: str) -> int:
    """Durée en minutes. Une heure par défaut, comme un rendez-vous ordinaire.

    On lit d'abord ce qui suit explicitement « pendant », « pour » ou
    « d'une durée de ». À défaut, on cherche un format standalone (« 3 heures »)
    dans le texte après avoir retiré la partie horaire pour éviter la confusion
    (« à 9h 3 heures » → 180 min, pas 540).
    """
    t = _normaliser(texte)

    # « de 14h à 16h » : la durée se déduit des bornes.
    bornes = re.search(
        r"\bde\s+(\d{1,2})\s*[h:]\s*(\d{2})?\s*(?:a|jusqu.?a)\s+(\d{1,2})\s*[h:]?\s*(\d{2})?", t
    )
    if bornes:
        depart = int(bornes.group(1)) * 60 + int(bornes.group(2) or 0)
        arrivee = int(bornes.group(3)) * 60 + int(bornes.group(4) or 0)
        if arrivee > depart:
            return max(5, min(arrivee - depart, 600))

    # Segment qui suit le marqueur de durée, et lui seul.
    marqueur = re.search(r"\b(?:pendant|pour|d.une duree de|duree de|dure)\s+(.{0,24})", t)
    segment = marqueur.group(1) if marqueur else ""

    if segment:
        m = re.search(r"^\s*(\d{1,3})\s*(?:min|minutes?)\b", segment)
        if m:
            return max(5, min(int(m.group(1)), 600))

        m = re.search(r"^\s*(\d{1,2})\s*[h:]\s*(\d{2})\b", segment)
        if m:
            return max(5, min(int(m.group(1)) * 60 + int(m.group(2)), 600))

        m = re.search(r"^\s*(\d{1,2})\s*(?:h\b|heures?\b)", segment)
        if m:
            return max(5, min(int(m.group(1)) * 60, 600))

        if re.match(r"^\s*(?:une\s+)?demi[- ]heure\b", segment):
            return 30

        for mot, valeur in NOMBRES.items():
            if re.match(rf"^\s*{mot}\s+heures?\b", segment):
                return min(valeur * 60, 600)

    if re.search(r"\bdemi[- ]heure\b", t):
        return 30

    # Format standalone : « 3 heures », « 45 min » — en ne retirant que le
    # premier motif horaire trouvé (après « à ») pour ne pas confondre
    # « 9h » avec une durée, tout en gardant un « 1h30 » situé plus loin.
    pos_apres_heure = re.search(r"\b[aà]\s*\d{1,2}\s*[h:](?:\s*\d{2})?\b", t)
    if pos_apres_heure:
        reste = t[:pos_apres_heure.start()] + " " + t[pos_apres_heure.end():]
    else:
        reste = t
    m = re.search(r"\b(\d{1,2})\s*[h:]\s*(\d{2})\b", reste)
    if m:
        return max(5, min(int(m.group(1)) * 60 + int(m.group(2)), 600))
    m = re.search(r"\b(\d{1,2})\s*heures?\b", reste)
    if m:
        return max(5, min(int(m.group(1)) * 60, 600))
    m = re.search(r"\b(\d{1,2})\s*(?:min|minutes?)\b", reste)
    if m:
        return max(5, min(int(m.group(1)), 600))

    return DUREE_DEFAUT


def lire_bornes(texte: str) -> tuple[tuple[int, int], int] | None:
    """(heure de début, durée) si la phrase contient un horaire exploitable."""
    debut = lire_heure(texte)
    if debut is None:
        return None
    return debut, lire_duree(texte)


def _borner(heures: int, minutes: int) -> tuple[int, int] | None:
    if 0 <= heures <= 23 and 0 <= minutes <= 59:
        return heures, minutes
    return None


def nettoyer_titre(texte: str) -> str:
    """Retire les mots de commande pour ne garder qu'un intitulé plausible."""
    t = texte.strip()
    t = re.sub(
        r"^\s*(peux-tu\s+)?(cr[ée]e[rz]?|ajoute[rz]?|planifie[rz]?|programme[rz]?|"
        r"supprime[rz]?|annule[rz]?|efface[rz]?|enl[èe]ve[rz]?)\s+(moi\s+)?",
        "",
        t,
        flags=re.I,
    )
    t = re.sub(r"^\s*(un|une|le|la|les|mon|ma|mes)\s+", "", t, flags=re.I)
    # Retire les repères temporels : ils sont déjà interprétés par ailleurs.
    t = re.sub(
        r"\b(demain|apr[èe]s-demain|aujourd.hui|hier|lundi|mardi|mercredi|jeudi|vendredi|"
        r"samedi|dimanche|la semaine prochaine|prochain|prochaine)\b",
        "",
        t,
        flags=re.I,
    )
    t = re.sub(r"\b[àa]\s*\d{1,2}\s*[h:]\s*\d{0,2}\b", "", t, flags=re.I)
    t = re.sub(r"\b\d{1,2}\s*[h:]\s*\d{0,2}\b", "", t, flags=re.I)
    t = re.sub(r"\b(pendant|dure|d.une dur[ée]e de)\s+[^,.]*", "", t, flags=re.I)
    t = re.sub(r"\b(le|du)\s+\d{1,2}([/-]\d{1,2})?\b", "", t, flags=re.I)
    t = re.sub(r"\s{2,}", " ", t).strip(" .,;:'\"")
    return t
