import { AlertTriangle, CalendarPlus, Check, CircleHelp, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { useState } from 'react'
import type { AssistantBlock, Explanation } from '@/types'
import { Button } from '@/components/ui/button'
import { Meter } from '@/components/ui/meter'
import { fmtDay, fmtTime } from '@/lib/time'
import { useCreateEvent, useDeleteEvent } from '@/hooks/useWorkspaceData'
import { notify } from '@/store/useNotificationStore'

export function ExplanationCard({ explanation, compact = false }: { explanation: Explanation; compact?: boolean }) {
  return (
    <div className="rounded-md border border-line bg-surface-2/60 p-3.5">
      <p className="mb-3 flex items-start gap-2 text-[13px] leading-relaxed text-ink-2">
        <CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
        <span>{explanation.summary}</span>
      </p>
      <div className={compact ? 'space-y-2' : 'grid gap-3 sm:grid-cols-2'}>
        {explanation.criteria.map((criterion) => (
          <Meter
            key={criterion.key}
            label={criterion.label}
            value={criterion.weight}
            detail={criterion.detail}
            tone={criterion.weight >= 0.85 ? 'urgent' : 'accent'}
          />
        ))}
      </div>
    </div>
  )
}

/** Proposition d'écriture dans Google Calendar. Rien ne part sans ce clic. */
function ActionCard({
  question,
  confirmLabel,
  icon,
  detail,
  danger = false,
  onConfirm,
  pending,
  forceLabel,
  onForce,
  forcePending,
}: {
  question: string
  confirmLabel: string
  icon: React.ReactNode
  detail: string
  danger?: boolean
  onConfirm: () => void
  pending: boolean
  /** Libellé du bouton de contournement explicite (proposé après un conflit). */
  forceLabel?: string
  onForce?: () => void
  forcePending?: boolean
}) {
  const [done, setDone] = useState<'aucun' | 'confirme' | 'annule'>('aucun')

  if (done === 'confirme') {
    return (
      <div className="rounded-md border border-ok/25 bg-ok-soft p-3 text-[13px] text-ok">
        Action effectuée dans Google Calendar.
      </div>
    )
  }
  if (done === 'annule') {
    return (
      <div className="rounded-md border border-line bg-surface-2 p-3 text-[13px] text-ink-soft">
        Action annulée. Rien n&apos;a été modifié.
      </div>
    )
  }

  return (
    <div
      className={
        danger
          ? 'rounded-md border border-urgent/25 bg-urgent-soft/50 p-3.5'
          : 'rounded-md border border-accent/25 bg-accent-soft/50 p-3.5'
      }
    >
      <p className="mb-1 flex items-start gap-2 text-[13px] font-medium text-ink">
        {icon}
        {question}
      </p>
      <p className="mb-3 font-numeric text-[11.5px] text-ink-soft">{detail}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={danger ? 'danger' : 'accent'}
          loading={pending}
          onClick={() => {
            onConfirm()
            setDone('confirme')
          }}
        >
          <Check className="h-3.5 w-3.5" aria-hidden />
          {confirmLabel}
        </Button>
        {forceLabel && onForce && (
          <Button
            size="sm"
            variant="danger"
            loading={forcePending}
            onClick={() => {
              onForce()
              setDone('confirme')
            }}
          >
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            {forceLabel}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setDone('annule')}>
          <X className="h-3.5 w-3.5" aria-hidden />
          Annuler
        </Button>
      </div>
    </div>
  )
}

export function AssistantBlockView({ block }: { block: AssistantBlock }) {
  const createEvent = useCreateEvent()
  const deleteEvent = useDeleteEvent()

  switch (block.type) {
    case 'texte':
      return <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink-2">{block.content}</p>

    case 'avertissement':
      return (
        <div className="rounded-md border border-urgent/25 bg-urgent-soft p-3.5">
          <p className="mb-1 flex items-center gap-2 text-[13px] font-medium text-urgent">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            {block.title}
          </p>
          <p className="whitespace-pre-line text-[13px] leading-relaxed text-ink-2">{block.content}</p>
        </div>
      )

    case 'resume-journee':
      return (
        <div className="rounded-md border border-line bg-surface p-3.5">
          <p className="mb-2 font-display text-[14px] font-medium leading-snug text-ink">{block.headline}</p>
          <ul className="space-y-1.5">
            {block.points.map((point) => (
              <li key={point} className="flex gap-2 text-[13px] leading-relaxed text-ink-soft">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden />
                {point}
              </li>
            ))}
          </ul>
        </div>
      )

    case 'action-creer':
      return (
        <ActionCard
          question={block.question}
          confirmLabel={block.confirmLabel}
          icon={<CalendarPlus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />}
          detail={`${fmtDay(block.start)} · ${fmtTime(block.start)} – ${fmtTime(block.end)}`}
          pending={createEvent.isPending}
          onConfirm={() =>
            createEvent.mutate({
              title: block.title,
              start: block.start,
              end: block.end,
              description: 'Créé par KAIROS depuis votre demande.',
            })
          }
          forceLabel={block.conflict ? block.forceLabel : undefined}
          forcePending={createEvent.isPending}
          onForce={
            block.conflict && block.originalStart && block.originalEnd
              ? () =>
                  createEvent.mutate({
                    title: block.title,
                    start: block.originalStart!,
                    end: block.originalEnd!,
                    description:
                      "Créé par KAIROS malgré un conflit détecté, à la demande explicite de l'utilisateur.",
                  })
              : undefined
          }
        />
      )

    case 'action-supprimer':
      return (
        <ActionCard
          danger
          question={block.question}
          confirmLabel={block.confirmLabel}
          icon={<Trash2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-urgent" aria-hidden />}
          detail={`${fmtDay(block.start)} · ${fmtTime(block.start)} – ${fmtTime(block.end)}`}
          pending={deleteEvent.isPending}
          onConfirm={() => deleteEvent.mutate({ eventId: block.eventId, title: block.title })}
        />
      )

    case 'explication':
      return <ExplanationCard explanation={block.explanation} compact />

    case 'resultat':
      return (
        <div
          className={
            block.status === 'succes'
              ? 'rounded-md border border-ok/25 bg-ok-soft p-3 text-[13px] text-ok'
              : 'rounded-md border border-urgent/25 bg-urgent-soft p-3 text-[13px] text-urgent'
          }
        >
          {block.content}
        </div>
      )

    default:
      return null
  }
}

/** Journalise côté notifications ce que l'agent vient de refuser ou signaler. */
export function journaliserReponse(blocks: AssistantBlock[]) {
  for (const block of blocks) {
    if (block.type !== 'avertissement') continue
    const conflit = block.title.toLowerCase().includes('conflit')
    notify({
      category: conflit ? 'conflit' : 'action-impossible',
      title: block.title,
      body: block.content,
    })
    if (conflit) toast.warning(block.title)
  }
}
