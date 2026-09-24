import { useState } from 'react'
import { toast } from 'sonner'
import { CircleHelp } from 'lucide-react'
import type { Explanation } from '@/types'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Meter } from '@/components/ui/meter'

const feedbackOptions = [
  { id: 'correct', label: 'Ce classement est correct' },
  { id: 'plus-important', label: 'Cette tâche est plus importante' },
  { id: 'autre-horaire', label: 'Je préfère un autre horaire' },
  { id: 'regle', label: 'Ne plus utiliser cette règle' },
] as const

/**
 * « Pourquoi ce choix ? » — chaque décision de l'agent expose ses critères et
 * accepte une correction, qui alimentera l'apprentissage des préférences.
 */
export function WhyDialog({
  explanation,
  subject,
  trigger,
}: {
  explanation: Explanation
  subject: string
  trigger?: React.ReactNode
}) {
  const [choice, setChoice] = useState<string | null>(null)

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="ghost">
            <CircleHelp className="h-3.5 w-3.5" aria-hidden />
            Pourquoi ce choix ?
          </Button>
        )}
      </DialogTrigger>
      <DialogContent widthClass="max-w-xl">
        <DialogHeader>
          <DialogTitle>Pourquoi ce choix ?</DialogTitle>
          <DialogDescription>{subject}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          <p className="rounded-md border border-line bg-surface-2 px-4 py-3 text-[13.5px] leading-relaxed text-ink-2">
            {explanation.summary}
          </p>

          <div>
            <p className="eyebrow mb-3">Critères utilisés</p>
            <div className="grid gap-4 sm:grid-cols-2">
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

          <div>
            <p className="eyebrow mb-2">Votre avis</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {feedbackOptions.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setChoice(option.id)}
                  aria-pressed={choice === option.id}
                  className={
                    choice === option.id
                      ? 'rounded-sm border border-accent/40 bg-accent-soft px-3 py-2 text-left text-[13px] text-accent-ink'
                      : 'rounded-sm border border-line bg-surface px-3 py-2 text-left text-[13px] text-ink-soft transition-colors hover:border-line-strong hover:text-ink'
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button
            variant="accent"
            disabled={!choice}
            onClick={() =>
              toast.success('Préférence enregistrée', {
                description: 'KAIROS en tiendra compte lors des prochaines propositions.',
              })
            }
          >
            Enregistrer mon avis
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
