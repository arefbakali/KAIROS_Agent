import type { CalendarEvent } from '@/types'
import { AGENT_API_URL } from './agent.service'

const BASE = AGENT_API_URL.replace(/\/$/, '')

export type WeekDay =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

export interface ReminderStatus {
  connected: boolean
  email?: string
  reminders?: Record<string, {
    event_id: string
    kind: string
    event_title: string
    event_start: string
    sent: boolean
  }>
  /** Résumé hebdomadaire : fonctionnalité additionnelle, indépendante des rappels ci-dessus. */
  weeklySummaryEnabled?: boolean
  weeklySummaryDay?: WeekDay | null
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Erreur rappels (${response.status}): ${detail.slice(0, 200)}`)
  }
  return (await response.json()) as T
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`)
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Erreur rappels (${response.status}): ${detail.slice(0, 200)}`)
  }
  return (await response.json()) as T
}

export interface ReminderSyncEvent {
  eventId: string
  title: string
  start: string
  end: string
  userId: string
  enabled: boolean
}

function getTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export const reminderApi = {
  async getAuthUrl(userId: string): Promise<{ url: string }> {
    const params = new URLSearchParams({ userId })
    return get(`/api/reminders/auth-url?${params}`)
  },

  async syncEvents(events: ReminderSyncEvent[]): Promise<{ status: string; scheduled: number }> {
    return post('/api/reminders/sync', { events, timezone: getTimezone() })
  },

  async cancelReminders(eventId: string, userId: string): Promise<{ status: string }> {
    return post('/api/reminders/cancel', { eventId, userId })
  },

  async getStatus(userId: string): Promise<ReminderStatus> {
    const params = new URLSearchParams({ userId })
    return get(`/api/reminders/status?${params}`)
  },

  syncAllEvents(events: CalendarEvent[], userId: string, enabled: boolean) {
    const upcoming = events.filter((e) => new Date(e.start) > new Date())
    return reminderApi.syncEvents(
      upcoming.map((e) => ({
        eventId: e.id,
        title: e.title,
        start: e.start,
        end: e.end,
        userId,
        enabled,
      })),
    )
  },

  async setWeeklySummaryPrefs(
    userId: string,
    enabled: boolean,
    day: WeekDay,
  ): Promise<{ status: string }> {
    return post('/api/reminders/weekly-summary-prefs', { userId, enabled, day })
  },
}
