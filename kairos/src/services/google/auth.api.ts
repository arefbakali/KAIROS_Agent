import { SCOPES, googleFetch, hasScope, readStoredToken, requestAccessToken, revokeAccess } from './gis'

const USERINFO = 'https://www.googleapis.com/oauth2/v3/userinfo'

interface GoogleUserInfo {
  sub: string
  name?: string
  given_name?: string
  family_name?: string
  email?: string
  picture?: string
}

export interface AuthenticatedUser {
  id: string
  firstName: string
  lastName: string
  email: string
  avatarUrl: string | null
  timezone: string
}

export interface SignInResult {
  user: AuthenticatedUser
  grantedScopes: string[]
  calendarGranted: boolean
  gmailGranted: boolean
}

function guessTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris'
  } catch {
    return 'Europe/Paris'
  }
}

/**
 * Connexion à KAIROS. Une seule fenêtre de consentement couvre l'identité, le
 * calendrier et la messagerie : dès le retour, l'application travaille sur le
 * compte réel de l'utilisateur.
 */
export const authApi = {
  async signIn(): Promise<SignInResult> {
    const token = await requestAccessToken()
    const info = await googleFetch<GoogleUserInfo>(USERINFO)

    const fallbackName = (info.email ?? 'utilisateur').split('@')[0]
    const [given, ...rest] = (info.name ?? fallbackName).split(' ')

    return {
      user: {
        id: info.sub,
        firstName: info.given_name ?? given ?? fallbackName,
        lastName: info.family_name ?? rest.join(' '),
        email: info.email ?? '',
        avatarUrl: info.picture ?? null,
        timezone: guessTimezone(),
      },
      grantedScopes: token.scope.split(' '),
      calendarGranted: hasScope(token, SCOPES.calendrier[1]),
      gmailGranted: hasScope(token, SCOPES.courriel[0]),
    }
  },

  /** Rouvre le consentement pour récupérer une portée refusée. */
  async requestMissingScopes(): Promise<SignInResult> {
    await requestAccessToken({ forcePrompt: true })
    return authApi.signIn()
  },

  hasValidToken(): boolean {
    return readStoredToken() !== null
  },

  async signOut(): Promise<void> {
    await revokeAccess()
  },
}
