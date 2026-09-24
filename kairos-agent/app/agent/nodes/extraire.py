"""Nœud « extraire » — lecture du calendrier sur la période demandée.

Aucun appel au modèle ici, et c'est délibéré : tout ce qui est chiffré doit être
calculé, pas rédigé. Un agent qui annonce « trois réunions » alors qu'il y en a
deux ruine la confiance dans tout le reste. Le modèle ne recevra que des faits
déjà établis et n'aura le droit que de les mettre en phrases.

La granularité s'adapte à la longueur de la période : jour par jour jusqu'à
seize jours, semaine par semaine au-delà. Sans cela, une demande portant sur
l'ensemble du calendrier produirait un prompt ingérable.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta

from app.agent.fuseau import maintenant, resoudre_zone
from app.agent.periode import Periode, jour_fr, libelle_jour
from app.agent.state import AgentState
from app.schemas import CalendarEvent, DayBrief, PeriodFacts, WeekBrief

DAY_START = time(8, 0)
DAY_END = time(19, 0)

MEETING_KINDS = {"reunion", "cours"}
FOCUS_KINDS = {"concentration", "tache"}


def _minutes(event: CalendarEvent) -> int:
    return max(int((event.end - event.start).total_seconds() // 60), 0)


def _overlaps(a: CalendarEvent, b: CalendarEvent) -> bool:
    return a.start < b.end and b.start < a.end


def _free_slots(events: list[CalendarEvent], jour: date, tz) -> list[tuple[datetime, datetime]]:
    """Plages libres d'au moins trente minutes dans les heures ouvrées."""
    ouverture = datetime.combine(jour, DAY_START, tzinfo=tz)
    fermeture = datetime.combine(jour, DAY_END, tzinfo=tz)

    occupe = sorted(((e.start, e.end) for e in events), key=lambda pair: pair[0])
    creneaux: list[tuple[datetime, datetime]] = []
    curseur = ouverture

    for debut, fin in occupe:
        if debut > curseur:
            creneaux.append((curseur, min(debut, fermeture)))
        curseur = max(curseur, fin)
    if curseur < fermeture:
        creneaux.append((curseur, fermeture))

    return [(d, f) for d, f in creneaux if f > d and (f - d) >= timedelta(minutes=30)]


def extraire(state: AgentState) -> AgentState:
    events: list[CalendarEvent] = state.get("events", [])
    periode: Periode = state["periode"]
    zone = state.get("zone") or resoudre_zone(None)
    tz = zone

    retenus = sorted(
        (e for e in events if periode.debut <= e.start.date() <= periode.fin),
        key=lambda e: e.start,
    )

    par_jour: dict[date, list[CalendarEvent]] = defaultdict(list)
    for event in retenus:
        par_jour[event.start.date()].append(event)

    busy = sum(_minutes(e) for e in retenus)
    meetings = sum(_minutes(e) for e in retenus if e.kind in MEETING_KINDS)
    focus = sum(_minutes(e) for e in retenus if e.kind in FOCUS_KINDS)

    # --- Conflits, sur la période entière -----------------------------------
    overlaps: list[str] = []
    tight: list[str] = []
    for jour, du_jour in sorted(par_jour.items()):
        for i in range(len(du_jour)):
            for j in range(i + 1, len(du_jour)):
                premier, second = du_jour[i], du_jour[j]
                if not _overlaps(premier, second):
                    continue
                minutes = int(
                    (min(premier.end, second.end) - max(premier.start, second.start)).total_seconds()
                    // 60
                )
                overlaps.append(
                    f"{libelle_jour(jour)} : « {premier.title} » et « {second.title} » "
                    f"se recouvrent de {minutes} minutes"
                )
        for avant, apres in zip(du_jour, du_jour[1:]):
            if not apres.travelMinutes:
                continue
            ecart = int((apres.start - avant.end).total_seconds() // 60)
            if 0 <= ecart < apres.travelMinutes:
                tight.append(
                    f"{libelle_jour(jour)} : {ecart} minutes seulement avant « {apres.title} », "
                    f"qui demande {apres.travelMinutes} minutes de trajet"
                )

    # --- Détail par jour ou agrégat par semaine -----------------------------
    jours: list[DayBrief] = []
    semaines: list[WeekBrief] = []
    libre_total = 0
    plus_longue: tuple[datetime, datetime] | None = None

    curseur = periode.debut
    while curseur <= periode.fin:
        du_jour = par_jour.get(curseur, [])
        occupe = sum(_minutes(e) for e in du_jour)

        if curseur.weekday() < 5:
            creneaux = _free_slots(du_jour, curseur, tz)
            libre_total += sum(int((f - d).total_seconds() // 60) for d, f in creneaux)
            for creneau in creneaux:
                if plus_longue is None or (creneau[1] - creneau[0]) > (plus_longue[1] - plus_longue[0]):
                    plus_longue = creneau

        if periode.detaille_par_jour:
            jours.append(
                DayBrief(
                    date=curseur.isoformat(),
                    weekday=jour_fr(curseur),
                    eventCount=len(du_jour),
                    busyMinutes=occupe,
                    firstStart=du_jour[0].start.strftime("%H:%M") if du_jour else None,
                    lastEnd=du_jour[-1].end.strftime("%H:%M") if du_jour else None,
                    titles=[e.title for e in du_jour][:6],
                )
            )
        curseur += timedelta(days=1)

    if not periode.detaille_par_jour:
        par_semaine: dict[date, list[CalendarEvent]] = defaultdict(list)
        for event in retenus:
            jour = event.start.date()
            par_semaine[jour - timedelta(days=jour.weekday())].append(event)

        for lundi in sorted(par_semaine):
            de_la_semaine = par_semaine[lundi]
            charge = defaultdict(int)
            for event in de_la_semaine:
                charge[event.start.date()] += _minutes(event)
            pic = max(charge, key=charge.get) if charge else None
            semaines.append(
                WeekBrief(
                    start=lundi.isoformat(),
                    end=(lundi + timedelta(days=6)).isoformat(),
                    label=f"semaine du {libelle_jour(lundi)}",
                    eventCount=len(de_la_semaine),
                    busyMinutes=sum(_minutes(e) for e in de_la_semaine),
                    busiestDay=libelle_jour(pic) if pic else None,
                )
            )

    # --- Journées remarquables ----------------------------------------------
    charge_par_jour = {j: sum(_minutes(e) for e in ev) for j, ev in par_jour.items()}
    plus_charge = max(charge_par_jour, key=charge_par_jour.get) if charge_par_jour else None
    ouvres = [j for j in charge_par_jour if j.weekday() < 5 and charge_par_jour[j] > 0]
    plus_leger = min(ouvres, key=charge_par_jour.get) if ouvres else None

    libres: list[str] = []
    curseur = periode.debut
    while curseur <= periode.fin and len(libres) < 8:
        if curseur.weekday() < 5 and not par_jour.get(curseur):
            libres.append(libelle_jour(curseur))
        curseur += timedelta(days=1)

    # --- Prochain rendez-vous, même hors période ----------------------------
    instant = maintenant(zone)
    suivant = next((e for e in sorted(events, key=lambda x: x.start) if e.start > instant), None)

    # --- Couverture réelle des données reçues -------------------------------
    couverture_debut = min((e.start.date() for e in events), default=None)
    couverture_fin = max((e.end.date() for e in events), default=None)
    hors_couverture = bool(
        couverture_debut
        and couverture_fin
        and (periode.fin < couverture_debut or periode.debut > couverture_fin)
    )

    facts = PeriodFacts(
        start=periode.debut.isoformat(),
        end=periode.fin.isoformat(),
        label=periode.libelle,
        dayCount=periode.nb_jours,
        granularity="jour" if periode.detaille_par_jour else "semaine",
        eventCount=len(retenus),
        busyMinutes=busy,
        meetingMinutes=meetings,
        focusMinutes=focus,
        freeMinutes=libre_total,
        days=jours,
        weeks=semaines,
        busiestDay=libelle_jour(plus_charge) if plus_charge else None,
        lightestWorkingDay=libelle_jour(plus_leger) if plus_leger else None,
        freeDays=libres,
        firstStart=retenus[0].start.strftime("%H:%M") if retenus else None,
        lastEnd=retenus[-1].end.strftime("%H:%M") if retenus else None,
        nextEventTitle=suivant.title if suivant else None,
        nextEventStart=suivant.start.strftime("%H:%M") if suivant else None,
        nextEventDate=libelle_jour(suivant.start.date()) if suivant else None,
        longestFreeSlot=(
            {
                "date": libelle_jour(plus_longue[0].date()),
                "start": plus_longue[0].strftime("%H:%M"),
                "end": plus_longue[1].strftime("%H:%M"),
            }
            if plus_longue
            else None
        ),
        overlaps=overlaps[:12],
        tightTravel=tight[:8],
        coverageStart=couverture_debut.isoformat() if couverture_debut else None,
        coverageEnd=couverture_fin.isoformat() if couverture_fin else None,
        outsideCoverage=hors_couverture,
    )

    return {"facts": facts, "periode_events": retenus}


def format_agenda(facts: PeriodFacts, events: list[CalendarEvent]) -> str:
    """Agenda compact remis au modèle, borné pour ne pas saturer le contexte."""
    if not events:
        return "(aucun événement sur cette période)"

    if facts.granularity == "jour":
        lignes: list[str] = []
        for brief in facts.days:
            du_jour = [e for e in events if e.start.date().isoformat() == brief.date]
            if not du_jour:
                continue
            lignes.append(f"{brief.weekday} {brief.date} :")
            for event in du_jour[:8]:
                lieu = f", à {event.location}" if event.location else ""
                lignes.append(
                    f"  - {event.start.strftime('%H:%M')}–{event.end.strftime('%H:%M')} "
                    f"{event.title}{lieu}"
                )
        return "\n".join(lignes) or "(aucun événement sur cette période)"

    return "\n".join(
        f"- {s.label} : {s.eventCount} événements, {s.busyMinutes} minutes occupées"
        + (f", pic le {s.busiestDay}" if s.busiestDay else "")
        for s in facts.weeks
    )
