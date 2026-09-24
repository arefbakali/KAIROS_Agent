import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthenticatedUser } from '@/services/google/auth.api'
import { readStoredToken } from '@/services/google/gis'

interface SessionState {
  user: AuthenticatedUser | null
  grantedScopes: string[]
  calendarGranted: boolean
  gmailGranted: boolean
  /** Horodatage de la dernière lecture réussie chez Google. */
  lastSyncAt: string | null
  signIn: (payload: {
    user: AuthenticatedUser
    grantedScopes: string[]
    calendarGranted: boolean
    gmailGranted: boolean
  }) => void
  markSynced: () => void
  signOut: () => void
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      user: null,
      grantedScopes: [],
      calendarGranted: false,
      gmailGranted: false,
      lastSyncAt: null,
      signIn: ({ user, grantedScopes, calendarGranted, gmailGranted }) =>
        set({
          user,
          grantedScopes,
          calendarGranted,
          gmailGranted,
          lastSyncAt: new Date().toISOString(),
        }),
      markSynced: () => set({ lastSyncAt: new Date().toISOString() }),
      signOut: () =>
        set({
          user: null,
          grantedScopes: [],
          calendarGranted: false,
          gmailGranted: false,
          lastSyncAt: null,
        }),
    }),
    { name: 'kairos-session' },
  ),
)

/**
 * Une session n'est valable que si le profil *et* le jeton sont présents.
 * Le jeton vit en `sessionStorage` : fermer l'onglet ferme la session, même si
 * le profil reste en mémoire locale.
 */
export function useIsAuthenticated(): boolean {
  const user = useSessionStore((state) => state.user)
  return Boolean(user) && readStoredToken() !== null
}

export function useCurrentUser(): AuthenticatedUser | null {
  return useSessionStore((state) => state.user)
}

export function initials(user: AuthenticatedUser): string {
  const first = user.firstName?.[0] ?? ''
  const last = user.lastName?.[0] ?? ''
  return (first + last || user.email[0] || '?').toUpperCase()
}
