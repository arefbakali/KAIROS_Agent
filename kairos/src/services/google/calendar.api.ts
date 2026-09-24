import type { CalendarEvent, EventKind } from '@/types'
import { googleFetch } from './gis'

const BASE = 'https://www.googleapis.com/calendar/v3'

interface GoogleDateTime {
  dateTime?: string
  date?: string
  timeZone?: string
}

interface GoogleEvent {
  id: string
  summary?: string
  description?: string
  location?: string
  status?: string
  start?: GoogleDateTime
  end?: GoogleDateTime
  attendees?: Array<{ email?: string; responseStatus?: string }>
  organizer?: { self?: boolean }
  eventType?: string
  transparency?: string
}

interface GoogleEventList {
  items?: GoogleEvent[]
  nextPageToken?: string
}

interface GoogleCalendarListEntry {
  id: string
  summary?: string
  primary?: boolean
  selected?: boolean
  accessRole?: string
}

/**
 * Devine la nature d'un événement à partir de son intitulé.
 * Le back-end LangGraph fera mieux ; cette heuristique suffit à colorer la
 * grille de façon utile dès la première connexion.
 */
function inferKind(event: GoogleEvent): EventKind {
  const title = (event.summary ?? '').toLowerCase()
  const match = (...needles: string[]) => needles.some((needle) => title.includes(needle))

  if (match('déjeuner', 'dejeuner', 'pause', 'repas', 'café')) return 'pause'
  if (match('trajet', 'route', 'déplacement', 'transport')) return 'deplacement'
  if (match('cours', 'td ', 'tp ', 'amphi', 'examen', 'partiel')) return 'cours'
  if (match('sport', 'salle', 'médecin', 'dentiste', 'anniversaire', 'famille')) return 'personnel'
  if (match('focus', 'concentration', 'rédaction', 'redaction', 'travail sur', 'révision')) {
    return 'concentration'
  }
  if ((event.attendees?.length ?? 0) > 0 || match('réunion', 'reunion', 'point', 'call', 'entretien')) {
    return 'reunion'
  }
  return 'reunion'
}

function toCalendarEvent(event: GoogleEvent): CalendarEvent | null {
  // Les événements sur la journée entière ne tiennent pas dans une grille
  // horaire : on les écarte plutôt que de les afficher à un faux horaire.
  if (!event.start?.dateTime || !event.end?.dateTime) return null
  if (event.status === 'cancelled') return null

  return {
    id: event.id,
    title: event.summary?.trim() || 'Sans titre',
    start: new Date(event.start.dateTime).toISOString(),
    end: new Date(event.end.dateTime).toISOString(),
    kind: inferKind(event),
    location: event.location?.trim() || null,
    travelMinutes: event.location ? 20 : 0,
    source: 'google',
    taskId: null,
    notes: event.description?.trim().slice(0, 220) || null,
    // Un événement avec d'autres participants engage plus qu'une note perso :
    // KAIROS ne le déplacera pas de lui-même.
    locked: (event.attendees?.length ?? 0) > 0 || event.organizer?.self === false,
  }
}

export const googleCalendarApi = {
  async listCalendars() {
    const data = await googleFetch<{ items?: GoogleCalendarListEntry[] }>(`${BASE}/users/me/calendarList?minAccessRole=reader`,
    )
    return (data.items ?? []).map((calendar) => ({
      id: calendar.id,
      name: calendar.summary ?? calendar.id,
      selected: Boolean(calendar.primary ?? calendar.selected),
    }))
  },

  /**
   * Événements horodatés sur une large fenêtre glissante.
   *
   * La fenêtre est volontairement généreuse : l'agent doit avoir une vue
   * d'ensemble du calendrier pour répondre à « et le 12 août ? » ou « le mois
   * prochain ». Un mois en arrière suffit à l'historique, six mois en avant
   * couvrent l'horizon utile d'un étudiant.
   */
  async listEvents(options: { calendarId?: string; daysBefore?: number; daysAfter?: number } = {}) {
    const { calendarId = 'primary', daysBefore = 30, daysAfter = 180 } = options
    const timeMin = new Date(Date.now() - daysBefore * 86_400_000).toISOString()
    const timeMax = new Date(Date.now() + daysAfter * 86_400_000).toISOString()

    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '2500',
    })

    const data = await googleFetch<GoogleEventList>(`${BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    )

    return (data.items ?? [])
      .map(toCalendarEvent)
      .filter((event): event is CalendarEvent => event !== null)
  },

  async createEvent(input: {
    calendarId?: string
    title: string
    start: string
    end: string
    description?: string
    location?: string
  }) {
    const { calendarId = 'primary' } = input
    const created = await googleFetch<GoogleEvent>(`${BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        body: JSON.stringify({
          summary: input.title,
          description: input.description,
          location: input.location,
          start: { dateTime: input.start },
          end: { dateTime: input.end },
        }),
      },
    )
    return toCalendarEvent(created)
  },

  async moveEvent(eventId: string, start: string, end: string, calendarId = 'primary') {
    const updated = await googleFetch<GoogleEvent>(`${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ start: { dateTime: start }, end: { dateTime: end } }),
      },
    )
    return toCalendarEvent(updated)
  },

  async deleteEvent(eventId: string, calendarId = 'primary') {
    await googleFetch<void>(`${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: 'DELETE' },
    )
  },
}
