import { googleFetch } from './gis'

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'

interface GmailProfile {
  emailAddress: string
  messagesTotal: number
  threadsTotal: number
}

interface GmailMessageRef {
  id: string
  threadId: string
}

interface GmailMessage {
  id: string
  snippet?: string
  internalDate?: string
  payload?: { headers?: Array<{ name: string; value: string }> }
}

export interface MailSummary {
  id: string
  subject: string
  from: string
  snippet: string
  receivedAt: string
}

/** Encodage RFC 2822 → base64url, attendu par l'endpoint d'envoi. */
function encodeMessage(raw: string): string {
  const bytes = new TextEncoder().encode(raw)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function header(message: GmailMessage, name: string): string {
  return message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

export const gmailApi = {
  async profile(): Promise<GmailProfile> {
    return googleFetch<GmailProfile>(`${BASE}/profile`)
  },

  /**
   * Derniers courriels susceptibles de contenir un engagement de calendrier.
   * Sert à montrer que l'agent peut détecter une invitation reçue par courriel.
   */
  async recentInvitations(max = 5): Promise<MailSummary[]> {
    const query = encodeURIComponent('newer_than:7d (invitation OR réunion OR rendez-vous OR meeting)')
    const list = await googleFetch<{ messages?: GmailMessageRef[] }>(`${BASE}/messages?maxResults=${max}&q=${query}`,
    )

    const refs = list.messages ?? []
    const messages = await Promise.all(
      refs.map((ref) =>
        googleFetch<GmailMessage>(`${BASE}/messages/${ref.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        ),
      ),
    )

    return messages.map((message) => ({
      id: message.id,
      subject: header(message, 'Subject') || 'Sans objet',
      from: header(message, 'From'),
      snippet: message.snippet ?? '',
      receivedAt: message.internalDate
        ? new Date(Number(message.internalDate)).toISOString()
        : new Date().toISOString(),
    }))
  },

  /** Envoie un courriel depuis le compte connecté. */
  async send(input: { to: string; subject: string; body: string }): Promise<void> {
    const raw = [
      `To: ${input.to}`,
      `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(input.subject)))}?=`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      input.body,
    ].join('\r\n')

    await googleFetch<{ id: string }>(`${BASE}/messages/send`, {
      method: 'POST',
      body: JSON.stringify({ raw: encodeMessage(raw) }),
    })
  },
}
