/**
 * Appels au back-end de l'agent (FastAPI + LangGraph + Qwen3 local).
 *
 * Le jeton Google vit dans le navigateur : le back-end n'a aucun accès direct
 * au calendrier. Le front-end lui transmet donc les événements qu'il a déjà
 * lus. Quand l'OAuth passera côté serveur, ce paramètre disparaîtra sans que
 * l'interface change.
 */

import type { AssistantBlock, AssistantMessage, CalendarEvent } from '@/types'

export const AGENT_API_URL = (import.meta.env.VITE_AGENT_API_URL ?? '').trim()

/** Sans URL configurée, le copilote garde son comportement local. */
export const agentConfigured = AGENT_API_URL.length > 0

export interface AgentReply {
  id: string
  role: 'agent'
  createdAt: string
  blocks: AssistantBlock[]
  /** Période effectivement analysée, renvoyée par le back-end. */
  period?: { start: string; end: string; label: string }
  intent?: string
}

export interface AgentHealth {
  status: 'ok' | 'degraded'
  provider: string
  model: string
  reachable: boolean
  detail: string | null
}

export class AgentUnavailable extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AgentUnavailable'
  }
}

/**
 * Identifiant de session stable par onglet, pour la mémoire conversationnelle.
 * Survit les navigations mais disparaît à la fermeture de l'onglet.
 */
function getSessionId(): string {
  const KEY = 'kairos-session-id'
  let id = sessionStorage.getItem(KEY)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(KEY, id)
  }
  return id
}

/**
 * Fuseau horaire du navigateur, transmis à chaque appel.
 *
 * Sans lui, le back-end interpréterait les horodatages UTC comme des heures
 * locales et annoncerait « 09:15 » pour un rendez-vous de 10:15 — une erreur
 * silencieuse qui fausserait aussi les conflits et les créations.
 */
function timezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** Le back-end n'a besoin que des champs qu'il sait interpréter. */
function serialize(events: CalendarEvent[]) {
  return events.map((event) => ({
    id: event.id,
    title: event.title,
    start: event.start,
    end: event.end,
    kind: event.kind,
    location: event.location,
    travelMinutes: event.travelMinutes,
    source: event.source,
    taskId: event.taskId,
    notes: event.notes,
    locked: event.locked,
  }))
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${AGENT_API_URL.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new AgentUnavailable(
      `Le back-end de l\u2019agent est injoignable sur ${AGENT_API_URL}. Lancez « uvicorn app.main:app --reload ».`,
    )
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new AgentUnavailable(`L\u2019agent a répondu ${response.status}. ${detail.slice(0, 180)}`)
  }

  return (await response.json()) as T
}

export const agentApi = {
  /**
   * Extraction puis présentation d'une période : une journée, une semaine, un
   * mois, ou une expression libre comme « la semaine prochaine ».
   */
  async present(
    events: CalendarEvent[],
    options: { firstName?: string; date?: string; start?: string; end?: string; query?: string } = {},
  ): Promise<AgentReply> {
    return post<AgentReply>('/api/agent/present', {
      events: serialize(events),
      firstName: options.firstName ?? null,
      date: options.date ?? null,
      start: options.start ?? null,
      end: options.end ?? null,
      query: options.query ?? null,
      timezone: timezone(),
      sessionId: getSessionId(),
    })
  },

  /** Raccourci pour la journée en cours. */
  async presentDay(events: CalendarEvent[], firstName?: string, date?: string): Promise<AgentReply> {
    return agentApi.present(events, { firstName, date })
  },

  async chat(message: string, events: CalendarEvent[], firstName?: string): Promise<AgentReply> {
    return post<AgentReply>('/api/agent/chat', {
      message,
      events: serialize(events),
      firstName: firstName ?? null,
      timezone: timezone(),
      sessionId: getSessionId(),
    })
  },

  async health(): Promise<AgentHealth> {
    const response = await fetch(`${AGENT_API_URL.replace(/\/$/, '')}/api/agent/health`)
    if (!response.ok) throw new AgentUnavailable('Contrôle de santé impossible.')
    return (await response.json()) as AgentHealth
  },

  toMessage(reply: AgentReply): AssistantMessage {
    return {
      id: reply.id,
      role: 'agent',
      createdAt: reply.createdAt,
      blocks: reply.blocks,
    }
  },
}
