import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { authApi } from '@/services/google/auth.api'
import { GoogleAuthError, googleConfigured } from '@/services/google/gis'
import { googleCalendarApi } from '@/services/google/calendar.api'
import { gmailApi } from '@/services/google/gmail.api'
import { useSessionStore } from '@/store/useSessionStore'


export { googleConfigured }

/** Relance le consentement pour récupérer une portée refusée. */
export function useRequestScopes() {
  const signIn = useSessionStore((state) => state.signIn)
  const client = useQueryClient()

  return useMutation({
    mutationFn: () => authApi.requestMissingScopes(),
    onSuccess: async (result) => {
      signIn(result)
      await client.invalidateQueries()
      toast.success('Autorisations mises à jour')
    },
    onError: (error: Error) =>
      toast.error('Autorisation refusée', {
        description: error instanceof GoogleAuthError ? error.message : error.message,
      }),
  })
}

export function useSignOut() {
  const signOut = useSessionStore((state) => state.signOut)
  const client = useQueryClient()

  return useMutation({
    mutationFn: () => authApi.signOut(),
    onSuccess: () => {
      signOut()
      client.clear()
    },
  })
}

export function useGoogleSync() {
  const markSynced = useSessionStore((state) => state.markSynced)
  const client = useQueryClient()

  return useMutation({
    mutationFn: () => googleCalendarApi.listEvents(),
    onSuccess: async () => {
      markSynced()
      await client.invalidateQueries()
      toast.success('Synchronisation terminée')
    },
    onError: (error: Error) => toast.error('Synchronisation impossible', { description: error.message }),
  })
}

export function useGoogleCalendars() {
  const granted = useSessionStore((state) => state.calendarGranted)
  return useQuery({
    queryKey: ['google-calendars'],
    queryFn: googleCalendarApi.listCalendars,
    enabled: granted,
  })
}

export function useGmailInvitations() {
  const granted = useSessionStore((state) => state.gmailGranted)
  return useQuery({
    queryKey: ['gmail-invitations'],
    queryFn: () => gmailApi.recentInvitations(),
    enabled: granted,
    retry: false,
  })
}

export function useSendMail() {
  return useMutation({
    mutationFn: (input: { to: string; subject: string; body: string }) => gmailApi.send(input),
    onSuccess: () => toast.success('Courriel envoyé', { description: 'Vérifiez vos messages envoyés.' }),
    onError: (error: Error) => toast.error('Envoi impossible', { description: error.message }),
  })
}
