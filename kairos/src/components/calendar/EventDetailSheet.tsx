import { useState } from 'react'
import { AlertTriangle, CalendarClock, Lock, MapPin, Trash2 } from 'lucide-react'
import type { CalendarEvent } from '@/types'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { eventKindStyle } from '@/lib/appearance'
import { durationMinutes, fmtDay, fmtTime, humanDuration } from '@/lib/time'
import { useDeleteEvent } from '@/hooks/useWorkspaceData'

export function EventDetailSheet({
  event,
  onOpenChange,
}: {
  event: CalendarEvent | null
  onOpenChange: (open: boolean) => void
}) {
  const deleteEvent = useDeleteEvent()
  const [confirmation, setConfirmation] = useState(false)

  if (!event) return null
  const kind = eventKindStyle[event.kind]

  return (
    <Dialog open={Boolean(event)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{event.title}</DialogTitle>
          <DialogDescription>
            {fmtDay(event.start)} · {fmtTime(event.start)} – {fmtTime(event.end)} ·{' '}
            {humanDuration(durationMinutes(event.start, event.end))}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutre">{kind.label}</Badge>
            <Badge tone={event.source === 'google' ? 'focus' : event.source === 'kairos' ? 'accent' : 'neutre'}>
              {event.source === 'google' ? 'Google Calendar' : event.source === 'kairos' ? 'Placé par KAIROS' : 'Local'}
            </Badge>
            {event.locked && (
              <Badge tone="neutre">
                <Lock className="h-3 w-3" aria-hidden /> Non déplaçable
              </Badge>
            )}
          </div>

          {event.location && (
            <p className="flex items-center gap-2 text-sm text-ink-2">
              <MapPin className="h-4 w-4 text-ink-faint" aria-hidden />
              {event.location}
            </p>
          )}

          {event.travelMinutes > 0 && (
            <p className="flex items-center gap-2 rounded-sm border border-line bg-surface-2 px-3 py-2 text-[13px] text-ink-2">
              <CalendarClock className="h-4 w-4 text-ink-faint" aria-hidden />
              {event.travelMinutes} minutes de trajet à prévoir avant le début.
            </p>
          )}

          {event.notes && <p className="text-sm leading-relaxed text-ink-soft">{event.notes}</p>}

          {event.locked && (
            <p className="flex items-start gap-2 rounded-sm border border-line bg-surface-2 px-3 py-2 text-[13px] text-ink-soft">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
              KAIROS ne déplacera jamais cet événement de lui-même : il est marqué comme fixe.
            </p>
          )}
        </DialogBody>

        <DialogFooter>
          {confirmation ? (
            <>
              <p className="mr-auto max-w-[60%] text-[12.5px] leading-relaxed text-urgent">
                Cet événement sera définitivement supprimé de Google Calendar.
              </p>
              <Button variant="ghost" onClick={() => setConfirmation(false)}>
                Annuler
              </Button>
              <Button
                variant="danger"
                loading={deleteEvent.isPending}
                onClick={async () => {
                  await deleteEvent.mutateAsync({ eventId: event.id, title: event.title })
                  setConfirmation(false)
                  onOpenChange(false)
                }}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Confirmer la suppression
              </Button>
            </>
          ) : (
            <>
              <Button variant="danger" className="mr-auto" onClick={() => setConfirmation(true)}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Supprimer
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Fermer
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
