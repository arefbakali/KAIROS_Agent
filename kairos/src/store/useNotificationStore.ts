import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type NotificationCategory =
  | 'evenement-cree'
  | 'evenement-supprime'
  | 'conflit'
  | 'action-impossible'
  | 'erreur-google'
  | 'synchronisation'

export interface AppNotification {
  id: string
  category: NotificationCategory
  title: string
  body: string
  createdAt: string
  read: boolean
}

interface NotificationState {
  items: AppNotification[]
  push: (entry: Omit<AppNotification, 'id' | 'createdAt' | 'read'>) => void
  markRead: (id: string) => void
  markAllRead: () => void
  remove: (id: string) => void
  clear: () => void
}

/**
 * Journal réel des opérations de l'application. Chaque entrée correspond à
 * quelque chose qui s'est effectivement produit : un événement écrit dans
 * Google Calendar, une suppression, un conflit refusé, une erreur d'API.
 * Aucune donnée n'est pré-remplie.
 */
export const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      items: [],
      push: (entry) =>
        set((state) => ({
          items: [
            {
              id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              createdAt: new Date().toISOString(),
              read: false,
              ...entry,
            },
            // On garde les cinquante dernières : au-delà, la page devient illisible.
            ...state.items,
          ].slice(0, 50),
        })),
      markRead: (id) =>
        set((state) => ({
          items: state.items.map((item) => (item.id === id ? { ...item, read: true } : item)),
        })),
      markAllRead: () =>
        set((state) => ({ items: state.items.map((item) => ({ ...item, read: true })) })),
      remove: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
      clear: () => set({ items: [] }),
    }),
    { name: 'kairos-notifications' },
  ),
)

/** Raccourci utilisable hors composant React. */
export function notify(entry: Omit<AppNotification, 'id' | 'createdAt' | 'read'>) {
  useNotificationStore.getState().push(entry)
}

export const notificationStyle: Record<
  NotificationCategory,
  { label: string; tone: 'neutre' | 'accent' | 'ok' | 'urgent' | 'focus' }
> = {
  'evenement-cree': { label: 'Événement créé', tone: 'ok' },
  'evenement-supprime': { label: 'Événement supprimé', tone: 'neutre' },
  conflit: { label: 'Conflit détecté', tone: 'accent' },
  'action-impossible': { label: 'Action impossible', tone: 'accent' },
  'erreur-google': { label: 'Erreur Google Calendar', tone: 'urgent' },
  synchronisation: { label: 'Synchronisation', tone: 'focus' },
}
