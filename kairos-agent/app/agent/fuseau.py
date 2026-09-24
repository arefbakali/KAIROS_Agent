"""Gestion du fuseau horaire de l'utilisateur.

Google Calendar renvoie des horodatages avec décalage (« 10:15+01:00 ») que le
front-end normalise en UTC avant de les transmettre. Sans reconversion, le
back-end lirait 09:15 et annoncerait une heure fausse — erreur invisible mais
qui fausse aussi la détection de conflits et la création d'événements.

Tout ce qui touche à une heure passe donc par ce module.

Note Windows : `zoneinfo` s'appuie sur la base IANA du système, absente sous
Windows. Le paquet `tzdata` la fournit et figure dans requirements.txt. En cas
d'installation incomplète, le repli final est `timezone.utc`, toujours
disponible : l'agent reste utilisable au lieu de renvoyer une erreur 500.
"""

from __future__ import annotations

from datetime import date, datetime, timezone, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

#: Repli si le navigateur n'a rien transmis ou si le nom est inconnu.
ZONE_DEFAUT = "Europe/Paris"


def resoudre_zone(nom: str | None) -> tzinfo:
    """Fuseau demandé, ou repli sûr. Ne lève jamais d'exception."""
    for candidat in (nom, ZONE_DEFAUT, "UTC"):
        if not candidat:
            continue
        try:
            return ZoneInfo(candidat)
        except (ZoneInfoNotFoundError, ValueError, KeyError, ImportError, ModuleNotFoundError):
            continue

    # Base IANA indisponible (typiquement Windows sans tzdata) : on reste en
    # UTC plutôt que d'interrompre la requête.
    return timezone.utc


def en_local(valeur: datetime, zone: tzinfo) -> datetime:
    """Ramène un horodatage dans le fuseau de l'utilisateur.

    Un horodatage sans fuseau est considéré comme déjà local : c'est le cas
    des heures saisies dans un formulaire.
    """
    if valeur.tzinfo is None:
        return valeur.replace(tzinfo=zone)
    return valeur.astimezone(zone)


def aujourdhui(zone: tzinfo) -> date:
    """Date du jour telle que l'utilisateur la voit, pas celle du serveur."""
    return datetime.now(timezone.utc).astimezone(zone).date()


def maintenant(zone: tzinfo) -> datetime:
    return datetime.now(timezone.utc).astimezone(zone)


def base_iana_disponible() -> bool:
    """La base IANA est-elle installée ? Sert au diagnostic dans /health."""
    try:
        ZoneInfo("UTC")
        return True
    except Exception:  # noqa: BLE001 — toute défaillance vaut « indisponible »
        return False
