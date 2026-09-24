/** Surface minimale de Google Identity Services réellement utilisée par KAIROS. */

interface GoogleTokenResponse {
  access_token: string
  expires_in: number | string
  scope: string
  token_type: string
  error?: string
  error_description?: string
}

interface GoogleTokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void
}

interface GoogleTokenClientConfig {
  client_id: string
  scope: string
  prompt?: string
  callback: (response: GoogleTokenResponse) => void
  error_callback?: (error: { type?: string; message?: string }) => void
}

interface GoogleOAuth2 {
  initTokenClient: (config: GoogleTokenClientConfig) => GoogleTokenClient
  revoke?: (accessToken: string, done?: () => void) => void
  hasGrantedAllScopes?: (token: GoogleTokenResponse, ...scopes: string[]) => boolean
}

interface Window {
  google?: {
    accounts?: {
      oauth2?: GoogleOAuth2
    }
  }
}
