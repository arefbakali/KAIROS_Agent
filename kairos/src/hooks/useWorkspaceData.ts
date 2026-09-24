import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { googleCalendarApi } from '@/services/google/calendar.api'
import { GoogleAuthError } from '@/services/google/gis'
import { useSessionStore } from '@/store/useSessionStore'
import { notify } from '@/store/useNotificationStore'
import { detectConflicts } from '@/lib/conflictDetection'
import { fmtTime, fmtDay } from '@/lib/time'
import { reminderApi, type WeekDay } from '@/services/reminder.api'
import type { Conflict } from '@/types'

export const queryKeys = {
  events: ['events'] as const,
  conflicts: ['conflicts'] as const,
}

/** Google Calendar est la source unique des événements. */
export function useCalendarIsLive() {
  return useSessionStore((state) => state.calendarGranted)
}

export function useEvents() {
  const live = useCalendarIsLive()
  return useQuery({
    queryKey: queryKeys.events,
    queryFn: () => googleCalendarApi.listEvents(),
    enabled: live,
  })
}

export function useConflicts() {
  const { data: events } = useEvents()
  return useQuery({
    queryKey: [...queryKeys.conflicts, events?.length ?? 0],
    queryFn: async (): Promise<Conflict[]> => detectConflicts(events ?? []),
    enabled: Boolean(events),
  })
}

function useInvalidate() {
  const client = useQueryClient()
  return () => client.invalidateQueries()
}

/** Message d'erreur lisible, quel que soit ce que Google a renvoyé. */
function describe(error: unknown): string {
  if (error instanceof GoogleAuthError) return error.message
  if (error instanceof Error) return error.message
  return 'Erreur inconnue.'
}

/** Tente de synchroniser les rappels e-mail (ne bloque pas l'UI en cas d'erreur). */
function fireReminderSync(events: { id: string; title: string; start: string }[], enabled = true) {
  const userId = useSessionStore.getState().user?.id
  if (!userId) return
  reminderApi.syncAllEvents(
    events.map((e) => ({ id: e.id, title: e.title, start: e.start, end: '', kind: 'reunion' as const, location: null, travelMinutes: 0, source: 'google' as const, taskId: null, notes: null, locked: false })),
    userId,
    enabled,
  ).catch(() => {})
}

function fireReminderCancel(eventId: string) {
  const userId = useSessionStore.getState().user?.id
  if (!userId) return
  reminderApi.cancelReminders(eventId, userId).catch(() => {})
}

export function useCreateEvent() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: {
      title: string
      start: string
      end: string
      description?: string
      location?: string
    }) =>
      googleCalendarApi.createEvent(input),
    onSuccess: async (event, input) => {
      await invalidate()
      const quand = `${fmtDay(input.start)} de ${fmtTime(input.start)} à ${fmtTime(input.end)}`
      notify({
        category: 'evenement-cree',
        title: `« ${input.title} » ajouté à votre agenda`,
        body: `${quand}. L'événement est visible dans Google Calendar.`,
      })
      toast.success('Événement créé', { description: event?.title ?? input.title })
      if (event) {
        fireReminderSync([{ id: event.id, title: event.title, start: event.start }])
      }
    },
    onError: (error) => {
      const detail = describe(error)
      notify({
        category: 'erreur-google',
        title: "L'événement n'a pas pu être créé",
        body: detail,
      })
      toast.error('Création impossible', { description: detail })
    },
  })
}

export function useDeleteEvent() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: { eventId: string; title: string }) =>
      googleCalendarApi.deleteEvent(input.eventId),
    onSuccess: async (_data, input) => {
      await invalidate()
      notify({
        category: 'evenement-supprime',
        title: `« ${input.title} » supprimé`,
        body: 'Le créneau est de nouveau libre dans Google Calendar.',
      })
      toast.success('Événement supprimé', { description: input.title })
      fireReminderCancel(input.eventId)
    },
    onError: (error) => {
      const detail = describe(error)
      notify({
        category: 'erreur-google',
        title: "L'événement n'a pas pu être supprimé",
        body: detail,
      })
      toast.error('Suppression impossible', { description: detail })
    },
  })
}

export function useMoveEvent() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, start, end }: { id: string; start: string; end: string }) =>
      googleCalendarApi.moveEvent(id, start, end),
    onSuccess: async (event, variables) => {
      await invalidate()
      notify({
        category: 'synchronisation',
        title: `« ${event?.title ?? 'Événement'} » déplacé`,
        body: `Nouvel horaire : ${fmtTime(variables.start)} – ${fmtTime(variables.end)}.`,
      })
      toast.success('Événement déplacé', { description: event?.title })
      if (event) {
        fireReminderSync([{ id: event.id, title: event.title, start: event.start }])
      }
    },
    onError: (error) => {
      const detail = describe(error)
      notify({ category: 'erreur-google', title: 'Déplacement refusé par Google', body: detail })
      toast.error('Déplacement impossible', { description: detail })
    },
  })
}

/** Applique la proposition d'un conflit : un ou plusieurs déplacements réels. */
export function useResolveConflict() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (conflict: Conflict) => {
      if (conflict.patch.length === 0) {
        throw new Error(
          'Aucun déplacement automatique possible : les deux événements sont verrouillés.',
        )
      }
      await Promise.all(
        conflict.patch.map((move) => googleCalendarApi.moveEvent(move.eventId, move.start, move.end)),
      )
      return conflict
    },
    onSuccess: async (conflict) => {
      await invalidate()
      notify({
        category: 'synchronisation',
        title: 'Conflit résolu',
        body: conflict.proposal,
      })
      toast.success('Conflit résolu', { description: 'Google Calendar a été mis à jour.' })
    },
    onError: (error) => {
      const detail = describe(error)
      notify({ category: 'action-impossible', title: 'Conflit non résolu', body: detail })
      toast.error('Résolution impossible', { description: detail })
    },
  })
}

// ── Rappels e-mail ─────────────────────────────────────────────────────────

export function useReminderStatus() {
  const user = useSessionStore((state) => state.user)
  return useQuery({
    queryKey: ['reminder-status', user?.id],
    queryFn: () => reminderApi.getStatus(user!.id),
    enabled: Boolean(user),
    refetchInterval: false,
  })
}

export function useConnectReminders() {
  const user = useSessionStore((state) => state.user)
  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Non connecté')
      const { url } = await reminderApi.getAuthUrl(user.id)
      window.open(url, '_blank', 'width=500,height=600')
    },
    onError: (error) => {
      toast.error('Connexion impossible', { description: describe(error) })
    },
  })
}

export function useSyncReminders() {
  const user = useSessionStore((state) => state.user)
  const { data: events } = useEvents()
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!user || !events) throw new Error('Données manquantes')
      return reminderApi.syncAllEvents(events, user.id, enabled)
    },
    onSuccess: () => toast.success('Rappels synchronisés'),
    onError: (error) => toast.error('Erreur de synchronisation', { description: describe(error) }),
  })
}

/** Résumé hebdomadaire par e-mail : fonctionnalité additionnelle aux rappels 1j/1h/30min. */
export function useSetWeeklySummaryPrefs() {
  const user = useSessionStore((state) => state.user)
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async ({ enabled, day }: { enabled: boolean; day: WeekDay }) => {
      if (!user) throw new Error('Non connecté')
      return reminderApi.setWeeklySummaryPrefs(user.id, enabled, day)
    },
    onSuccess: async () => {
      await invalidate()
      toast.success('Préférence du résumé hebdomadaire enregistrée')
    },
    onError: (error) => toast.error('Erreur', { description: describe(error) }),
  })
}
