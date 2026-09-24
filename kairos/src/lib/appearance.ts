import type { EventKind } from '@/types'

/** Une seule source de vérité pour la couleur des blocs et des étiquettes. */
export const eventKindStyle: Record<
  EventKind,
  { label: string; block: string; rail: string; text: string }
> = {
  reunion: {
    label: 'Réunion',
    block: 'bg-surface border-line-strong',
    rail: 'bg-ink',
    text: 'text-ink',
  },
  concentration: {
    label: 'Concentration',
    block: 'bg-focus-soft border-focus/25',
    rail: 'bg-focus',
    text: 'text-focus',
  },
  tache: {
    label: 'Tâche planifiée',
    block: 'bg-accent-soft border-accent/25',
    rail: 'bg-accent',
    text: 'text-accent-ink',
  },
  pause: {
    label: 'Pause',
    block: 'bg-surface-2 border-line',
    rail: 'bg-line-strong',
    text: 'text-ink-soft',
  },
  deplacement: {
    label: 'Déplacement',
    block: 'bg-surface-2 border-line border-dashed',
    rail: 'bg-ink-faint',
    text: 'text-ink-soft',
  },
  personnel: {
    label: 'Personnel',
    block: 'bg-ok-soft border-ok/25',
    rail: 'bg-ok',
    text: 'text-ok',
  },
  cours: {
    label: 'Cours',
    block: 'bg-surface border-line-strong',
    rail: 'bg-focus',
    text: 'text-ink',
  },
}




