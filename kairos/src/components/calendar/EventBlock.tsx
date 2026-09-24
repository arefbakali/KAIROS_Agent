import { useDraggable } from '@dnd-kit/core'
import { AlertTriangle, Lock, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CalendarEvent } from '@/types'
import { eventKindStyle } from '@/lib/appearance'
import { durationMinutes, fmtTime, humanDuration } from '@/lib/time'

interface Props {
  event: CalendarEvent
  conflicted?: boolean
  ghost?: boolean
  compact?: boolean
  draggable?: boolean
  onOpen?: (event: CalendarEvent) => void
  style?: React.CSSProperties
}

export function EventBlock({
  event,
  conflicted = false,
  ghost = false,
  compact = false,
  draggable = true,
  onOpen,
  style,
}: Props) {
  const minutes = durationMinutes(event.start, event.end)
  const kind = eventKindStyle[event.kind]
  const canDrag = draggable && !event.locked && !ghost

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: event.id,
    disabled: !canDrag,
  })

  const dragStyle = transform ? { transform: `translate3d(0, ${transform.y}px, 0)` } : undefined

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, ...dragStyle }}
      className={cn(
        'group absolute inset-x-0 overflow-hidden rounded-sm border px-2.5 py-1.5 text-left transition-shadow',
        kind.block,
        conflicted && 'border-urgent/50 ring-1 ring-urgent/30',
        ghost && 'border-dashed bg-transparent opacity-70',
        isDragging && 'z-30 cursor-grabbing shadow-lift',
        canDrag && !isDragging && 'cursor-grab hover:shadow-lift',
      )}
      {...(canDrag
        ? // La poignée de glissement reste sur le conteneur ; le bouton interne
          // garde le rôle interactif exposé aux lecteurs d'écran.
          { ...listeners, ...attributes, role: undefined, tabIndex: undefined }
        : {})}
    >
      <button
        type="button"
        onClick={() => onOpen?.(event)}
        className="block w-full text-left focus:outline-none"
        aria-label={`${event.title}, de ${fmtTime(event.start)} à ${fmtTime(event.end)}`}
      >
        <span
          className={cn('absolute left-0 top-0 h-full w-[3px] rounded-l-sm', kind.rail)}
          aria-hidden
        />
        <span className="flex items-center gap-1.5 pl-1.5">
          {conflicted && <AlertTriangle className="h-3 w-3 shrink-0 text-urgent" aria-hidden />}
          {event.locked && <Lock className="h-3 w-3 shrink-0 text-ink-faint" aria-hidden />}
          <span className={cn('truncate text-[12.5px] font-medium leading-tight', kind.text)}>{event.title}</span>
        </span>
        {!compact && minutes >= 45 && (
          <span className="mt-0.5 flex items-center gap-2 pl-1.5 font-numeric text-[10.5px] text-ink-faint">
            <span>
              {fmtTime(event.start)} – {fmtTime(event.end)}
            </span>
            <span>{humanDuration(minutes)}</span>
            {event.location && (
              <span className="flex min-w-0 items-center gap-1">
                <MapPin className="h-2.5 w-2.5 shrink-0" aria-hidden />
                <span className="truncate">{event.location}</span>
              </span>
            )}
          </span>
        )}
        {!compact && minutes >= 90 && event.notes && (
          <span className="mt-1 block truncate pl-1.5 text-[11px] text-ink-soft">{event.notes}</span>
        )}
      </button>
    </div>
  )
}
