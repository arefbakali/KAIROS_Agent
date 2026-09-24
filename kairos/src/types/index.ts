/** Modèle de domaine partagé entre l'UI, les services et l'agent. */

export type EventKind =
  | 'reunion'
  | 'concentration'
  | 'pause'
  | 'deplacement'
  | 'personnel'
  | 'cours'
  | 'tache'

export interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  kind: EventKind
  location: string | null
  /** Trajet nécessaire avant le début, en minutes */
  travelMinutes: number
  source: 'google' | 'kairos' | 'local'
  taskId: string | null
  notes: string | null
  locked: boolean
}

export interface ScoreCriterion {
  key: string
  label: string
  /** Contribution normalisée 0 → 1 */
  weight: number
  detail: string
}

export interface Explanation {
  summary: string
  criteria: ScoreCriterion[]
}

export type ConflictKind = 'chevauchement' | 'trajet-insuffisant'

export interface Conflict {
  id: string
  kind: ConflictKind
  severity: 'eleve' | 'moyen' | 'faible'
  title: string
  reason: string
  proposal: string
  consequence: string
  relatedEventIds: string[]
  relatedTaskIds: string[]
  /** Déplacements appliqués si la proposition est acceptée */
  patch: Array<{ eventId: string; start: string; end: string }>
  explanation: Explanation
  resolved: boolean
}

/* ---------- Blocs de réponse de l'agent ---------- */

export type AssistantBlock =
  | { type: 'texte'; content: string }
  | { type: 'avertissement'; title: string; content: string }
  | { type: 'resume-journee'; headline: string; points: string[] }
  | { type: 'explication'; explanation: Explanation }
  | { type: 'resultat'; status: 'succes' | 'echec'; content: string }
  | {
      type: 'action-creer'
      title: string
      start: string
      end: string
      question: string
      confirmLabel: string
      /** Présent quand cette proposition fait suite à un conflit détecté. */
      conflict?: boolean
      /** Créneau initialement demandé, conservé pour l'option « malgré le conflit ». */
      originalStart?: string
      originalEnd?: string
      forceLabel?: string
    }
  | {
      type: 'action-supprimer'
      eventId: string
      title: string
      start: string
      end: string
      question: string
      confirmLabel: string
    }

export interface AssistantMessage {
  id: string
  role: 'utilisateur' | 'agent'
  createdAt: string
  blocks: AssistantBlock[]
}

export interface Preferences {
  workStart: string
  workEnd: string
  focusBlockMinutes: number
  lunchStart: string
  lunchEnd: string
  voiceEnabled: boolean
}
