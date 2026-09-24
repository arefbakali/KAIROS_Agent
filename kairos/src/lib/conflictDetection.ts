import type { CalendarEvent, Conflict } from '@/types'
import { durationMinutes, fmtTime, overlaps } from './time'
import { differenceInMinutes, parseISO } from 'date-fns'

/**
 * Construit les points d'attention à partir d'événements réels.
 *
 * Le back-end LangGraph produira des conflits plus riches (dépendances,
 * énergie, historique). Cette version locale garantit que la page Aujourd'hui
 * reste utile dès la connexion à Google Calendar, sans attendre le serveur.
 */
export function detectConflicts(events: CalendarEvent[]): Conflict[] {
  const conflicts: Conflict[] = []
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start))

  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const first = sorted[i]
      const second = sorted[j]
      if (!overlaps(first.start, first.end, second.start, second.end)) continue

      const minutes = Math.min(
        durationMinutes(second.start, first.end),
        durationMinutes(first.start, second.end),
      )
      // Celui qu'on peut bouger : le plus souple des deux.
      const movable = first.locked ? second : first.locked === second.locked ? second : first
      const anchor = movable.id === first.id ? second : first
      const shift = durationMinutes(movable.start, movable.end)

      conflicts.push({
        id: `overlap_${first.id}_${second.id}`,
        kind: 'chevauchement',
        severity: minutes >= 30 ? 'eleve' : 'moyen',
        title: `« ${first.title} » et « ${second.title} » se chevauchent`,
        reason: `Les deux rendez-vous se recouvrent de ${minutes} minutes, à partir de ${fmtTime(second.start)}.`,
        proposal: movable.locked
          ? `Aucun des deux n\u2019est déplaçable : prévenez un des deux organisateurs.`
          : `Déplacer « ${movable.title} » à ${fmtTime(anchor.end)}, juste après « ${anchor.title} ».`,
        consequence: `Sans arbitrage, vous manquerez la fin de l\u2019un ou le début de l\u2019autre.`,
        relatedEventIds: [first.id, second.id],
        relatedTaskIds: [],
        patch: movable.locked
          ? []
          : [
              {
                eventId: movable.id,
                start: anchor.end,
                end: new Date(parseISO(anchor.end).getTime() + shift * 60_000).toISOString(),
              },
            ],
        explanation: {
          summary: movable.locked
            ? 'Les deux événements comportent des participants : KAIROS ne propose aucun déplacement automatique.'
            : `« ${anchor.title} » est marqué comme fixe, « ${movable.title} » peut donc être décalé sans casser d\u2019engagement.`,
          criteria: [
            {
              key: 'evenements-existants',
              label: 'Événements existants',
              weight: 1,
              detail: `Recouvrement de ${minutes} minutes.`,
            },
            {
              key: 'importance',
              label: 'Importance',
              weight: anchor.locked ? 0.9 : 0.5,
              detail: anchor.locked ? 'Un des deux ne peut pas bouger.' : 'Les deux sont souples.',
            },
            {
              key: 'duree',
              label: 'Durée',
              weight: Math.min(shift / 120, 1),
              detail: `Le bloc déplacé dure ${shift} minutes.`,
            },
          ],
        },
        resolved: false,
      })
    }
  }

  // Trajet insuffisant entre deux rendez-vous situés à des adresses différentes.
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const current = sorted[i]
    const next = sorted[i + 1]
    if (!next.travelMinutes || !next.location) continue

    const gap = differenceInMinutes(parseISO(next.start), parseISO(current.end))
    if (gap < 0 || gap >= next.travelMinutes) continue

    conflicts.push({
      id: `travel_${next.id}`,
      kind: 'trajet-insuffisant',
      severity: 'moyen',
      title: `Trajet trop court avant « ${next.title} »`,
      reason: `Il reste ${gap} minutes entre la fin de « ${current.title} » et le début du suivant, pour ${next.travelMinutes} minutes de route.`,
      proposal: `Terminer « ${current.title} » ${next.travelMinutes - gap} minutes plus tôt, ou prévenir de votre retard.`,
      consequence: `Vous arriverez avec environ ${next.travelMinutes - gap} minutes de retard.`,
      relatedEventIds: [current.id, next.id],
      relatedTaskIds: [],
      patch: [],
      explanation: {
        summary: `KAIROS compte ${next.travelMinutes} minutes de trajet dès qu\u2019un lieu est renseigné sur l\u2019événement.`,
        criteria: [
          { key: 'duree', label: 'Durée du trajet', weight: 0.6, detail: `${next.travelMinutes} minutes estimées.` },
          {
            key: 'evenements-existants',
            label: 'Événements existants',
            weight: 0.7,
            detail: `Seulement ${gap} minutes disponibles.`,
          },
        ],
      },
      resolved: false,
    })
  }

  return conflicts
}


/** Identifiants des événements qui se chevauchent, pour teinter la grille. */
export function detectOverlaps(events: CalendarEvent[]): string[] {
  const ids = new Set<string>()
  for (let i = 0; i < events.length; i += 1) {
    for (let j = i + 1; j < events.length; j += 1) {
      if (overlaps(events[i].start, events[i].end, events[j].start, events[j].end)) {
        ids.add(events[i].id)
        ids.add(events[j].id)
      }
    }
  }
  return [...ids]
}

/**
 * Événements qui chevauchent un créneau donné.
 *
 * Fonction partagée par les trois voies de création — assistant, formulaire
 * manuel, import de document — pour qu'aucune d'elles ne puisse contourner le
 * contrôle de conflit.
 */
export function findOverlapping(
  events: CalendarEvent[],
  start: string,
  end: string,
  ignoreId?: string,
): CalendarEvent[] {
  return events.filter(
    (event) => event.id !== ignoreId && overlaps(event.start, event.end, start, end),
  )
}

/** Résumé lisible d'un conflit, réutilisé dans les messages et notifications. */
export function describeOverlaps(conflits: CalendarEvent[]): string {
  return conflits
    .map((event) => `« ${event.title} » ${fmtTime(event.start)} – ${fmtTime(event.end)}`)
    .join(' ; ')
}
