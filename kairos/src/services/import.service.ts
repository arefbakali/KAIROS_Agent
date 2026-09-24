/** Envoi d'une image ou d'un PDF au back-end pour détection des événements. */

import { AGENT_API_URL, AgentUnavailable, agentConfigured } from './agent.service'

export interface DetectedEvent {
  titre: string
  date: string | null
  heureDebut: string | null
  heureFin: string | null
  description: string | null
  lieu: string | null
  /** Champs que l'utilisateur doit confirmer : rien n'a été deviné. */
  aVerifier: string[]
  complet: boolean
}

export interface ImportResult {
  source: 'texte-pdf' | 'vision'
  model: string
  fileName: string
  events: DetectedEvent[]
  needsReview: number
}

export interface ImportCapabilities {
  model: string
  vision: boolean
  acceptedMimeTypes: string[]
  hint: string | null
}

export const ACCEPTED = '.png,.jpg,.jpeg,.webp,.pdf,image/*,application/pdf'
export const MAX_SIZE = 12 * 1024 * 1024

export const importApi = {
  async analyze(file: File): Promise<ImportResult> {
    if (!agentConfigured) {
      throw new AgentUnavailable(
        'Aucun back-end configuré. Renseignez VITE_AGENT_API_URL dans le fichier .env.',
      )
    }
    if (file.size > MAX_SIZE) {
      throw new AgentUnavailable('Le fichier dépasse 12 Mo. Réduisez la taille de l\u2019image.')
    }

    const body = new FormData()
    body.append('file', file)

    let response: Response
    try {
      response = await fetch(`${AGENT_API_URL.replace(/\/$/, '')}/api/import/analyze`, {
        method: 'POST',
        body,
      })
    } catch {
      throw new AgentUnavailable(
        `Le back-end est injoignable sur ${AGENT_API_URL}. Lancez « uvicorn app.main:app --reload ».`,
      )
    }

    if (!response.ok) {
      const detail = await response.json().catch(() => null)
      throw new AgentUnavailable(
        detail?.detail ?? `L\u2019analyse a échoué (code ${response.status}).`,
      )
    }

    return (await response.json()) as ImportResult
  },

  async capabilities(): Promise<ImportCapabilities> {
    const response = await fetch(`${AGENT_API_URL.replace(/\/$/, '')}/api/import/capabilities`)
    if (!response.ok) throw new AgentUnavailable('Capacités du modèle indisponibles.')
    return (await response.json()) as ImportCapabilities
  },
}

/** Assemble date + heures en bornes ISO, avec une heure par défaut si la fin manque. */
export function toSlot(date: string, start: string, end: string | null): { start: string; end: string } {
  const debut = new Date(`${date}T${start}:00`)
  const fin = end ? new Date(`${date}T${end}:00`) : new Date(debut.getTime() + 60 * 60 * 1000)
  return {
    start: debut.toISOString(),
    end: (fin > debut ? fin : new Date(debut.getTime() + 60 * 60 * 1000)).toISOString(),
  }
}
