/**
 * Authentification et autorisation Google, sans back-end ni secret client.
 *
 * KAIROS demande toutes ses portées en une seule fois, à la connexion : le
 * compte qui s'ouvre devient immédiatement la source de vérité de
 * l'application. Une seule fenêtre de consentement, un seul jeton.
 *
 * Flux implicite (« token flow ») : aucun `client_secret` n'est nécessaire —
 * et il ne faut jamais en placer un dans un front-end.
 */

export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim()

/** Sans identifiant configuré, la connexion est impossible. */
export const googleConfigured = GOOGLE_CLIENT_ID.length > 0

export const SCOPES = {
  identite: ['openid', 'email', 'profile'],
  calendrier: [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
  ],
  courriel: [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
  ],
} as const

export const ALL_SCOPES = [...SCOPES.identite, ...SCOPES.calendrier, ...SCOPES.courriel].join(' ')

export interface GoogleToken {
  accessToken: string
  scope: string
  expiresAt: number
}

const STORAGE_KEY = 'kairos-google-token'
const GIS_SRC = 'https://accounts.google.com/gsi/client'

export class GoogleAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GoogleAuthError'
  }
}

let scriptPromise: Promise<void> | null = null

function loadIdentityServices(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new GoogleAuthError('Contexte non navigateur.'))
  if (window.google?.accounts?.oauth2) return Promise.resolve()

  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () =>
        reject(new GoogleAuthError('Le script Google n\u2019a pas pu être chargé.')),
      )
      return
    }

    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () =>
      reject(
        new GoogleAuthError(
          'Impossible de joindre accounts.google.com. Vérifiez votre connexion ou vos bloqueurs.',
        ),
      )
    document.head.appendChild(script)
  })

  return scriptPromise
}

export function readStoredToken(): GoogleToken | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const token = JSON.parse(raw) as GoogleToken
    // Marge d'une minute : on préfère redemander que subir un 401 en pleine action.
    return token.expiresAt - 60_000 > Date.now() ? token : null
  } catch {
    return null
  }
}

function storeToken(token: GoogleToken) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(token))
  } catch {
    /* Mode privé sans stockage : le jeton reste en mémoire pour la session. */
  }
}

export function clearStoredToken() {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* rien à faire */
  }
}

export function hasScope(token: GoogleToken | null, scope: string): boolean {
  return Boolean(token?.scope.includes(scope))
}

/** Ouvre la fenêtre de consentement Google et renvoie le jeton obtenu. */
export async function requestAccessToken(options: { forcePrompt?: boolean } = {}): Promise<GoogleToken> {
  if (!googleConfigured) {
    throw new GoogleAuthError(
      'Aucun identifiant client Google configuré. Renseignez VITE_GOOGLE_CLIENT_ID dans .env.',
    )
  }

  if (!options.forcePrompt) {
    const cached = readStoredToken()
    if (cached) return cached
  }

  await loadIdentityServices()
  const oauth2 = window.google?.accounts?.oauth2
  if (!oauth2) throw new GoogleAuthError('Google Identity Services est indisponible.')

  return new Promise<GoogleToken>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: ALL_SCOPES,
      prompt: options.forcePrompt ? 'consent' : '',
      callback: (response) => {
        if (response.error) {
          reject(new GoogleAuthError(describeError(response.error)))
          return
        }
        const token: GoogleToken = {
          accessToken: response.access_token,
          scope: response.scope,
          expiresAt: Date.now() + Number(response.expires_in ?? 3600) * 1000,
        }
        storeToken(token)
        resolve(token)
      },
      error_callback: (error) => reject(new GoogleAuthError(describeError(error?.type ?? 'popup_failed'))),
    })

    client.requestAccessToken()
  })
}

function describeError(code: string): string {
  switch (code) {
    case 'popup_closed':
    case 'popup_closed_by_user':
      return 'La fenêtre Google a été fermée avant la fin de l\u2019autorisation.'
    case 'popup_failed_to_open':
      return 'La fenêtre Google a été bloquée. Autorisez les fenêtres surgissantes pour ce site.'
    case 'access_denied':
      return 'L\u2019accès a été refusé sur l\u2019écran de consentement Google.'
    case 'invalid_client':
      return 'Identifiant client invalide. Vérifiez VITE_GOOGLE_CLIENT_ID et les origines autorisées.'
    default:
      return `Autorisation Google interrompue (${code}).`
  }
}

/** Révoque le jeton côté Google, puis oublie la session locale. */
export async function revokeAccess(): Promise<void> {
  const token = readStoredToken()
  clearStoredToken()
  if (!token) return

  await loadIdentityServices().catch(() => undefined)
  window.google?.accounts?.oauth2?.revoke?.(token.accessToken)
}

/** Appel authentifié aux API Google, avec messages d'erreur lisibles. */
export async function googleFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = readStoredToken() ?? (await requestAccessToken())

  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })

  if (response.status === 401 || response.status === 403) {
    const detail = await response.text().catch(() => '')
    if (response.status === 401) clearStoredToken()
    throw new GoogleAuthError(
      detail.includes('insufficient') || detail.includes('ACCESS_TOKEN_SCOPE')
        ? 'Autorisation insuffisante : reconnectez-vous pour accorder les accès demandés.'
        : 'La session Google a expiré. Reconnectez-vous pour continuer.',
    )
  }

  if (!response.ok) {
    throw new GoogleAuthError(`Google a répondu ${response.status} sur ${new URL(url).pathname}.`)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
