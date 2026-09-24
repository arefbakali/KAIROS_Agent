import { useEffect, useState } from 'react'
import { AlertTriangle, CalendarPlus } from 'lucide-react'
import { format } from 'date-fns'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/field'
import { useCreateEvent, useEvents } from '@/hooks/useWorkspaceData'
import { describeOverlaps, findOverlapping } from '@/lib/conflictDetection'
import { toSlot } from '@/services/import.service'
import { notify } from '@/store/useNotificationStore'

interface Draft {
  title: string
  date: string
  start: string
  end: string
  description: string
  location: string
}

const VIDE: Draft = { title: '', date: '', start: '', end: '', description: '', location: '' }

/**
 * Création manuelle d'un événement.
 *
 * Passe par les mêmes fonctions que l'assistant et l'import : `findOverlapping`
 * pour le contrôle de conflit, `useCreateEvent` pour l'écriture dans Google.
 */
export function EventFormDialog({
  open,
  onOpenChange,
  defaultDate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultDate?: Date
}) {
  const { data: events } = useEvents()
  const createEvent = useCreateEvent()

  const [draft, setDraft] = useState<Draft>(VIDE)
  const [erreur, setErreur] = useState<string | null>(null)
  const [conflits, setConflits] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setDraft({ ...VIDE, date: format(defaultDate ?? new Date(), 'yyyy-MM-dd'), start: '09:00', end: '10:00' })
    setErreur(null)
    setConflits(null)
  }, [open, defaultDate])

  const set = (champ: keyof Draft) => (value: string) =>
    setDraft((current) => ({ ...current, [champ]: value }))

  function valider(): string | null {
    if (draft.title.trim().length < 2) return 'Donnez un titre à l\u2019événement.'
    if (!draft.date) return 'Choisissez une date.'
    if (!draft.start) return 'Indiquez une heure de début.'
    if (draft.end && draft.end <= draft.start) return 'La fin doit suivre le début.'
    return null
  }

  async function soumettre(forcer: boolean) {
    const probleme = valider()
    if (probleme) {
      setErreur(probleme)
      return
    }
    setErreur(null)

    const slot = toSlot(draft.date, draft.start, draft.end || null)

    if (!forcer) {
      const chevauchements = findOverlapping(events ?? [], slot.start, slot.end)
      if (chevauchements.length > 0) {
        setConflits(describeOverlaps(chevauchements))
        notify({
          category: 'conflit',
          title: 'Conflit détecté — création suspendue',
          body: `« ${draft.title} » chevauche : ${describeOverlaps(chevauchements)}.`,
        })
        return
      }
    }

    await createEvent.mutateAsync({
      title: draft.title.trim(),
      start: slot.start,
      end: slot.end,
      description: draft.description.trim() || undefined,
      location: draft.location.trim() || undefined,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent widthClass="max-w-xl">
        <DialogHeader>
          <DialogTitle>Ajouter un événement</DialogTitle>
          <DialogDescription>
            L&apos;événement sera créé dans votre Google Calendar après vérification des conflits.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {erreur && (
            <p role="alert" className="rounded-md border border-urgent/25 bg-urgent-soft px-3.5 py-2.5 text-[13px] text-urgent">
              {erreur}
            </p>
          )}

          {conflits && (
            <div className="rounded-md border border-accent/30 bg-accent-soft/60 px-3.5 py-3">
              <p className="mb-1 flex items-center gap-2 text-[13px] font-medium text-accent-ink">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                Ce créneau est déjà occupé
              </p>
              <p className="text-[13px] leading-relaxed text-ink-2">{conflits}</p>
              <p className="mt-2 text-[12.5px] text-ink-soft">
                Changez l&apos;horaire, ou créez quand même si le chevauchement est voulu.
              </p>
            </div>
          )}

          <Field label="Titre" htmlFor="ev-title">
            <Input
              id="ev-title"
              value={draft.title}
              placeholder="Réunion d'équipe"
              onChange={(event) => set('title')(event.target.value)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Date" htmlFor="ev-date">
              <Input id="ev-date" type="date" value={draft.date} onChange={(e) => set('date')(e.target.value)} />
            </Field>
            <Field label="Début" htmlFor="ev-start">
              <Input id="ev-start" type="time" value={draft.start} onChange={(e) => set('start')(e.target.value)} />
            </Field>
            <Field label="Fin" htmlFor="ev-end" hint="Une heure par défaut">
              <Input id="ev-end" type="time" value={draft.end} onChange={(e) => set('end')(e.target.value)} />
            </Field>
          </div>

          <Field label="Lieu" htmlFor="ev-location" hint="Facultatif">
            <Input
              id="ev-location"
              value={draft.location}
              placeholder="Salle B12, ou visioconférence"
              onChange={(e) => set('location')(e.target.value)}
            />
          </Field>

          <Field label="Description" htmlFor="ev-description" hint="Facultatif">
            <Textarea
              id="ev-description"
              rows={3}
              value={draft.description}
              onChange={(e) => set('description')(e.target.value)}
            />
          </Field>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          {conflits ? (
            <Button variant="danger" loading={createEvent.isPending} onClick={() => void soumettre(true)}>
              Créer malgré le conflit
            </Button>
          ) : (
            <Button variant="accent" loading={createEvent.isPending} onClick={() => void soumettre(false)}>
              <CalendarPlus className="h-3.5 w-3.5" aria-hidden />
              Ajouter à Google Calendar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
