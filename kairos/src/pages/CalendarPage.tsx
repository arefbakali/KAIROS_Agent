import { useMemo, useState } from 'react'
import { addDays, isSameDay, parseISO, startOfWeek } from 'date-fns'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, FileUp, MapPin, Plus } from 'lucide-react'
import type { CalendarEvent } from '@/types'
import { PageHeader, PageShell } from '@/components/layout/PageHeader'
import { WeekGrid } from '@/components/calendar/WeekGrid'
import { DayTimeline } from '@/components/calendar/DayTimeline'
import { EventDetailSheet } from '@/components/calendar/EventDetailSheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Segmented } from '@/components/ui/segmented'
import { SkeletonPage } from '@/components/ui/skeleton'
import { useEvents } from '@/hooks/useWorkspaceData'
import { EventFormDialog } from '@/components/events/EventFormDialog'
import { ImportDialog } from '@/components/events/ImportDialog'
import { eventKindStyle } from '@/lib/appearance'
import { durationMinutes, fmtTime, humanDuration, weekDays } from '@/lib/time'

type ViewMode = 'jour' | 'semaine' | 'liste'

export function CalendarPage() {
  const { data: events, isLoading } = useEvents()

  const [mode, setMode] = useState<ViewMode>('semaine')
  const [reference, setReference] = useState(() => new Date())
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const days = useMemo(() => weekDays(reference), [reference])
  const weekLabel = `${format(days[0], 'd MMM', { locale: fr })} — ${format(days[6], 'd MMM yyyy', { locale: fr })}`

  if (isLoading || !events) {
    return (
      <PageShell>
        <SkeletonPage />
      </PageShell>
    )
  }

  const weekEvents = events.filter((event) =>
    days.some((day) => isSameDay(parseISO(event.start), day)),
  )

  return (
    <PageShell>
      <PageHeader
        eyebrow="Planning"
        title="Votre semaine, telle que KAIROS la lit"
        description="Événements importés, blocs de concentration, pauses et créneaux libres. Les zones hachurées signalent le temps encore disponible."
        actions={
          <>
            <div className="flex items-center gap-1 rounded-sm border border-line bg-surface p-0.5">
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Semaine précédente"
                onClick={() => setReference((current) => addDays(startOfWeek(current, { weekStartsOn: 1 }), -7))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-2 font-numeric text-[12px] text-ink-2">{weekLabel}</span>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Semaine suivante"
                onClick={() => setReference((current) => addDays(startOfWeek(current, { weekStartsOn: 1 }), 7))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setReference(new Date())}>
              Aujourd&apos;hui
            </Button>
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
              <FileUp className="h-3.5 w-3.5" aria-hidden />
              Importer
            </Button>
            <Button size="sm" variant="accent" onClick={() => setFormOpen(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Ajouter un événement
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          ariaLabel="Mode d'affichage du planning"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'jour', label: 'Jour' },
            { value: 'semaine', label: 'Semaine' },
            { value: 'liste', label: 'Liste' },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          {(['reunion', 'concentration', 'tache', 'pause', 'deplacement', 'personnel'] as const).map((kind) => (
            <span key={kind} className="flex items-center gap-1.5 text-[11.5px] text-ink-soft">
              <span className={`h-2 w-2 rounded-full ${eventKindStyle[kind].rail}`} aria-hidden />
              {eventKindStyle[kind].label}
            </span>
          ))}
        </div>
      </div>

      {mode === 'semaine' && (
        <WeekGrid reference={reference} events={events} onOpen={setSelectedEvent} />
      )}

      {mode === 'jour' && (
        <div className="max-w-3xl">
          <p className="mb-3 font-display text-[17px] font-semibold text-ink">
            {format(reference, 'EEEE d MMMM', { locale: fr })}
          </p>
          <DayTimeline day={reference} events={events} onOpen={setSelectedEvent} />
        </div>
      )}

      {mode === 'liste' && (
        <div className="space-y-6">
          {days.map((day) => {
            const dayEvents = weekEvents
              .filter((event) => isSameDay(parseISO(event.start), day))
              .sort((a, b) => a.start.localeCompare(b.start))

            return (
              <section key={day.toISOString()}>
                <p className="eyebrow mb-2">{format(day, 'EEEE d MMMM', { locale: fr })}</p>
                {dayEvents.length === 0 ? (
                  <p className="rounded-md border border-dashed border-line px-4 py-3 text-[13px] text-ink-faint">
                    Journée libre — de quoi accueillir un bloc de concentration.
                  </p>
                ) : (
                  <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
                    {dayEvents.map((event) => (
                      <li key={event.id}>
                        <button
                          onClick={() => setSelectedEvent(event)}
                          className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
                        >
                          <span className="font-numeric text-[12.5px] text-ink-soft">
                            {fmtTime(event.start)} – {fmtTime(event.end)}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">
                            {event.title}
                          </span>
                          {event.location && (
                            <span className="flex items-center gap-1 text-[12px] text-ink-faint">
                              <MapPin className="h-3 w-3" aria-hidden />
                              {event.location}
                            </span>
                          )}
                          <Badge tone="neutre">{eventKindStyle[event.kind].label}</Badge>
                          <span className="font-numeric text-[11.5px] text-ink-faint">
                            {humanDuration(durationMinutes(event.start, event.end))}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}

      
      <EventDetailSheet event={selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)} />
      <EventFormDialog open={formOpen} onOpenChange={setFormOpen} defaultDate={reference} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </PageShell>
  )
}
