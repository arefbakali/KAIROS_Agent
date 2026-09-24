import { useEffect, useRef } from 'react'
import { useSessionStore } from '@/store/useSessionStore'
import { useEvents } from '@/hooks/useWorkspaceData'
import { reminderApi } from '@/services/reminder.api'

/**
 * Synchronise automatiquement les rappels e-mail au chargement de l'application.
 * S'exécute une seule fois par session, quand les événements sont disponibles.
 */
export function ReminderInitializer() {
  const user = useSessionStore((state) => state.user)
  const { data: events } = useEvents()
  const synced = useRef(false)

  useEffect(() => {
    if (!user || !events || synced.current) return
    synced.current = true

    reminderApi
      .syncAllEvents(events, user.id, true)
      .catch(() => {})
  }, [user, events])

  return null
}
