import { useMemo } from 'react'
import { isSameDay, isToday, parseISO } from 'date-fns'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { CalendarEvent } from '@/types'
import { EventBlock } from './EventBlock'
import { detectOverlaps } from '@/lib/conflictDetection'
import { durationMinutes, minutesFromDayStart, weekDays } from '@/lib/time'
import { cn } from '@/lib/utils'

const PIXELS_PER_MINUTE = 0.82

export function WeekGrid({
  reference,
  events,
  proposedEvents = [],
  onOpen,
  fromHour = 7,
  toHour = 21,
}: {
  reference: Date
  events: CalendarEvent[]
  proposedEvents?: CalendarEvent[]
  onOpen?: (event: CalendarEvent) => void
  fromHour?: number
  toHour?: number
}) {
  const days = useMemo(() => weekDays(reference), [reference])
  const from = fromHour * 60
  const to = toHour * 60
  const height = (to - from) * PIXELS_PER_MINUTE
  const hours = Array.from({ length: toHour - fromHour + 1 }, (_, index) => fromHour + index)
  const conflictedIds = useMemo(() => detectOverlaps(events), [events])

  return (
    <div className="overflow-x-auto scroll-slim">
      <div className="min-w-[760px]">
        <div className="mb-2 grid grid-cols-[44px_repeat(7,1fr)] gap-1">
          <span />
          {days.map((day) => (
            <div
              key={day.toISOString()}
              className={cn(
                'rounded-sm px-2 py-1.5 text-center',
                isToday(day) ? 'bg-accent-soft' : 'bg-surface-2',
              )}
            >
              <p className="eyebrow">{format(day, 'EEE', { locale: fr })}</p>
              <p
                className={cn(
                  'font-numeric text-[15px] font-medium',
                  isToday(day) ? 'text-accent-ink' : 'text-ink',
                )}
              >
                {format(day, 'd')}
              </p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-[44px_repeat(7,1fr)] gap-1">
          <div className="relative" style={{ height }} aria-hidden>
            {hours.map((hour) => (
              <span
                key={hour}
                className="absolute right-1 -translate-y-1/2 font-numeric text-[10px] text-ink-faint"
                style={{ top: (hour * 60 - from) * PIXELS_PER_MINUTE }}
              >
                {String(hour).padStart(2, '0')}
              </span>
            ))}
          </div>

          {days.map((day) => {
            const dayEvents = events.filter((event) => isSameDay(parseISO(event.start), day))
            const dayProposals = proposedEvents.filter((event) => isSameDay(parseISO(event.start), day))

            return (
              <div
                key={day.toISOString()}
                className={cn(
                  'relative rounded-sm border border-line bg-surface',
                  isToday(day) && 'border-accent/30',
                )}
                style={{ height }}
              >
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="absolute inset-x-0 border-t border-line/60"
                    style={{ top: (hour * 60 - from) * PIXELS_PER_MINUTE }}
                    aria-hidden
                  />
                ))}

                <div className="absolute inset-x-1">
                  {dayProposals.map((event) => (
                    <EventBlock
                      key={`ghost-${event.id}`}
                      event={event}
                      ghost
                      compact
                      draggable={false}
                      style={{
                        top: (minutesFromDayStart(event.start) - from) * PIXELS_PER_MINUTE,
                        height: Math.max(durationMinutes(event.start, event.end) * PIXELS_PER_MINUTE - 2, 20),
                      }}
                    />
                  ))}
                  {dayEvents.map((event) => (
                    <EventBlock
                      key={event.id}
                      event={event}
                      compact
                      draggable={false}
                      conflicted={conflictedIds.includes(event.id)}
                      onOpen={onOpen}
                      style={{
                        top: (minutesFromDayStart(event.start) - from) * PIXELS_PER_MINUTE,
                        height: Math.max(durationMinutes(event.start, event.end) * PIXELS_PER_MINUTE - 2, 20),
                      }}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
