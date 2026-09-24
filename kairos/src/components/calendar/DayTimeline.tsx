import { useEffect, useMemo, useState } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { addMinutes, isSameDay, parseISO } from 'date-fns'
import type { CalendarEvent } from '@/types'
import { EventBlock } from './EventBlock'
import { detectOverlaps } from '@/lib/conflictDetection'
import { useMoveEvent } from '@/hooks/useWorkspaceData'
import { durationMinutes, humanDuration, minutesFromDayStart } from '@/lib/time'
import { cn } from '@/lib/utils'

const PIXELS_PER_MINUTE = 1.15
const SNAP_MINUTES = 15

interface FreeSlot {
  startMinutes: number
  endMinutes: number
}

/** Plages libres du jour, à l'intérieur des horaires affichés. */
function freeSlots(events: CalendarEvent[], from: number, to: number): FreeSlot[] {
  const busy = events
    .map((event) => ({
      start: minutesFromDayStart(event.start),
      end: minutesFromDayStart(event.end),
    }))
    .sort((a, b) => a.start - b.start)

  const slots: FreeSlot[] = []
  let cursor = from

  busy.forEach((block) => {
    if (block.start > cursor) slots.push({ startMinutes: cursor, endMinutes: Math.min(block.start, to) })
    cursor = Math.max(cursor, block.end)
  })
  if (cursor < to) slots.push({ startMinutes: cursor, endMinutes: to })

  return slots.filter((slot) => slot.endMinutes - slot.startMinutes >= 30)
}

export function DayTimeline({
  day,
  events,
  proposedEvents = [],
  onOpen,
  fromHour = 7,
  toHour = 21,
}: {
  day: Date
  events: CalendarEvent[]
  proposedEvents?: CalendarEvent[]
  onOpen?: (event: CalendarEvent) => void
  fromHour?: number
  toHour?: number
}) {
  const moveEvent = useMoveEvent()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const dayEvents = useMemo(
    () => events.filter((event) => isSameDay(parseISO(event.start), day)),
    [events, day],
  )
  const conflictedIds = useMemo(() => detectOverlaps(dayEvents), [dayEvents])

  const from = fromHour * 60
  const to = toHour * 60
  const height = (to - from) * PIXELS_PER_MINUTE
  const hours = Array.from({ length: toHour - fromHour + 1 }, (_, index) => fromHour + index)
  const gaps = useMemo(() => freeSlots(dayEvents, from, to), [dayEvents, from, to])

  const showNowLine = isSameDay(now, day)
  const nowOffset = (now.getHours() * 60 + now.getMinutes() - from) * PIXELS_PER_MINUTE

  function handleDragEnd(event: DragEndEvent) {
    const deltaMinutes = Math.round(event.delta.y / PIXELS_PER_MINUTE / SNAP_MINUTES) * SNAP_MINUTES
    if (!deltaMinutes) return

    const source = dayEvents.find((item) => item.id === event.active.id)
    if (!source) return

    moveEvent.mutate({
      id: source.id,
      start: addMinutes(parseISO(source.start), deltaMinutes).toISOString(),
      end: addMinutes(parseISO(source.end), deltaMinutes).toISOString(),
    })
  }

  return (
    <DndContext sensors={sensors} modifiers={[restrictToVerticalAxis]} onDragEnd={handleDragEnd}>
      <div className="flex gap-3">
        <div className="relative w-11 shrink-0" style={{ height }} aria-hidden>
          {hours.map((hour) => (
            <span
              key={hour}
              className="absolute right-0 -translate-y-1/2 font-numeric text-[10.5px] text-ink-faint"
              style={{ top: (hour * 60 - from) * PIXELS_PER_MINUTE }}
            >
              {String(hour).padStart(2, '0')}:00
            </span>
          ))}
        </div>

        <div
          className="relative flex-1 rounded-md border border-line bg-surface"
          style={{ height }}
          role="list"
          aria-label="Chronologie de la journée"
        >
          {hours.map((hour) => (
            <div
              key={hour}
              className="absolute inset-x-0 border-t border-line/70"
              style={{ top: (hour * 60 - from) * PIXELS_PER_MINUTE }}
              aria-hidden
            />
          ))}

          {gaps.map((slot) => (
            <div
              key={`${slot.startMinutes}-${slot.endMinutes}`}
              className="breath-band absolute inset-x-0 rounded-xs"
              style={{
                top: (slot.startMinutes - from) * PIXELS_PER_MINUTE,
                height: (slot.endMinutes - slot.startMinutes) * PIXELS_PER_MINUTE,
              }}
            >
              <span className="absolute right-2 top-1 font-numeric text-[10px] text-ink-faint">
                {humanDuration(slot.endMinutes - slot.startMinutes)} libres
              </span>
            </div>
          ))}

          <div className="absolute inset-x-2">
            {proposedEvents
              .filter((event) => isSameDay(parseISO(event.start), day))
              .map((event) => (
                <EventBlock
                  key={`ghost-${event.id}`}
                  event={event}
                  ghost
                  draggable={false}
                  style={{
                    top: (minutesFromDayStart(event.start) - from) * PIXELS_PER_MINUTE,
                    height: Math.max(durationMinutes(event.start, event.end) * PIXELS_PER_MINUTE - 3, 26),
                  }}
                />
              ))}

            {dayEvents.map((event) => (
              <EventBlock
                key={event.id}
                event={event}
                conflicted={conflictedIds.includes(event.id)}
                onOpen={onOpen}
                style={{
                  top: (minutesFromDayStart(event.start) - from) * PIXELS_PER_MINUTE,
                  height: Math.max(durationMinutes(event.start, event.end) * PIXELS_PER_MINUTE - 3, 26),
                }}
              />
            ))}
          </div>

          {showNowLine && nowOffset > 0 && nowOffset < height && (
            <div
              className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
              style={{ top: nowOffset }}
              aria-hidden
            >
              <span className="h-[7px] w-[7px] -translate-x-[3px] rounded-full bg-accent shadow-[0_0_0_3px_var(--color-accent-soft)]" />
              <span className={cn('h-px flex-1 bg-accent/45')} />
            </div>
          )}
        </div>
      </div>
    </DndContext>
  )
}
