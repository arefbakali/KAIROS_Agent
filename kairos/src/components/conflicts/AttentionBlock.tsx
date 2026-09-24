import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Check, PenLine, ShieldCheck } from 'lucide-react'
import type { Conflict } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { WhyDialog } from './WhyDialog'
import { useResolveConflict } from '@/hooks/useWorkspaceData'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const severityTone = {
  eleve: 'urgent',
  moyen: 'accent',
  faible: 'neutre',
} as const

const severityLabel = {
  eleve: 'À trancher',
  moyen: 'À surveiller',
  faible: 'Mineur',
} as const

export function AttentionBlock({ conflicts }: { conflicts: Conflict[] }) {
  const resolve = useResolveConflict()
  const open = conflicts.filter((conflict) => !conflict.resolved)

  if (open.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-ok/25 bg-ok-soft px-5 py-4">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden />
        <div>
          <p className="text-sm font-medium text-ok">Rien ne demande votre arbitrage</p>
          <p className="mt-0.5 text-[13px] text-ink-soft">
            KAIROS continue de surveiller votre calendrier et vous préviendra en cas de nouveau conflit.
          </p>
        </div>
      </div>
    )
  }

  return (
    <section aria-label="Attention nécessaire" className="space-y-2.5">
      <AnimatePresence initial={false}>
        {open.map((conflict) => (
          <motion.article
            key={conflict.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.24 }}
            className={cn(
              'rounded-lg border bg-surface p-4 shadow-hair sm:p-5',
              conflict.severity === 'eleve' ? 'border-urgent/30' : 'border-line',
            )}
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <AlertTriangle
                className={cn(
                  'h-3.5 w-3.5',
                  conflict.severity === 'eleve' ? 'text-urgent' : 'text-accent',
                )}
                aria-hidden
              />
              <h3 className="font-display text-[15px] font-semibold text-ink">{conflict.title}</h3>
              <Badge tone={severityTone[conflict.severity]}>{severityLabel[conflict.severity]}</Badge>
            </div>

            <p className="text-[13.5px] leading-relaxed text-ink-2">{conflict.reason}</p>

            <div className="my-3 rounded-md border border-accent/20 bg-accent-soft/50 px-3.5 py-2.5">
              <p className="eyebrow mb-1 text-accent">Proposition</p>
              <p className="text-[13.5px] leading-relaxed text-ink-2">{conflict.proposal}</p>
            </div>

            <p className="text-[12.5px] text-ink-faint">
              Sans décision : {conflict.consequence.charAt(0).toLowerCase() + conflict.consequence.slice(1)}
            </p>

            <div className="mt-3.5 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="accent"
                loading={resolve.isPending && resolve.variables?.id === conflict.id}
                onClick={() => resolve.mutate(conflict)}
              >
                <Check className="h-3.5 w-3.5" aria-hidden />
                Accepter
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  toast('Ajustement manuel', {
                    description: 'Faites glisser le bloc concerné dans la chronologie pour choisir un autre horaire.',
                  })
                }
              >
                <PenLine className="h-3.5 w-3.5" aria-hidden />
                Ajuster
              </Button>
              <WhyDialog explanation={conflict.explanation} subject={conflict.title} />
            </div>
          </motion.article>
        ))}
      </AnimatePresence>
    </section>
  )
}
