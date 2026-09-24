import { useMemo, useState } from 'react'
import { isSameDay, parseISO, format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { CalendarClock, FileUp, GitCompareArrows, Plus, RefreshCw } from 'lucide-react'
import { motion } from 'framer-motion'
import type { CalendarEvent } from '@/types'
import { PageShell } from '@/components/layout/PageHeader'
import { AttentionBlock } from '@/components/conflicts/AttentionBlock'
import { DayTimeline } from '@/components/calendar/DayTimeline'
import { EventDetailSheet } from '@/components/calendar/EventDetailSheet'
import { Button } from '@/components/ui/button'
import { SkeletonPage } from '@/components/ui/skeleton'
import { useConflicts, useEvents } from '@/hooks/useWorkspaceData'
import { useGoogleSync } from '@/hooks/useGoogle'
import { durationMinutes, fmtTime, humanDuration } from '@/lib/time'
import { useCurrentUser } from '@/store/useSessionStore'
import { EventFormDialog } from '@/components/events/EventFormDialog'
import { ImportDialog } from '@/components/events/ImportDialog'

function greeting(prenom: string, conflits: number, evenements: number) {
  if (evenements === 0) {
    return `Bonjour ${prenom}, aucun rendez-vous aujourd\u2019hui. La journée vous appartient.`
  }
  if (conflits === 0) {
    return `Bonjour ${prenom}, votre journée tient debout : ${evenements} rendez-vous, aucun arbitrage en attente.`
  }
  return `Bonjour ${prenom}, ${conflits} point${conflits > 1 ? 's' : ''} à trancher dans votre journée.`
}

function MetaItem({ label, value, tone }: { label: string; value: string; tone?: 'urgent' }) {
  return (
    <div className="min-w-0 border-l border-line pl-3.5 first:border-l-0 first:pl-0">
      <p className="eyebrow mb-1">{label}</p>
      <p
        className={
          tone === 'urgent'
            ? 'truncate text-[13.5px] font-medium text-urgent'
            : 'truncate text-[13.5px] font-medium text-ink'
        }
      >
        {value}
      </p>
    </div>
  )
}

export function TodayPage() {
  const today = useMemo(() => new Date(), [])
  const user = useCurrentUser()
  const { data: events, isLoading } = useEvents()
  const { data: conflicts } = useConflicts()
  const sync = useGoogleSync()
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  if (isLoading || !events) {
    return (
      <PageShell>
        <SkeletonPage />
      </PageShell>
    )
  }

  const dayEvents = events.filter((event) => isSameDay(parseISO(event.start), today))
  const openConflicts = (conflicts ?? []).filter(
    (conflict) =>
      !conflict.resolved &&
      conflict.relatedEventIds.some((id) => dayEvents.some((event) => event.id === id)),
  )

  const busyMinutes = dayEvents.reduce(
    (sum, event) => sum + durationMinutes(event.start, event.end),
    0,
  )
  const upcoming = dayEvents
    .filter((event) => parseISO(event.start) > new Date())
    .sort((a, b) => a.start.localeCompare(b.start))[0]

  return (
    <PageShell>
      <header className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="eyebrow">
            {format(today, 'EEEE d MMMM yyyy', { locale: fr })} · {user?.timezone ?? ''}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" loading={sync.isPending} onClick={() => sync.mutate()}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Actualiser
            </Button>
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
              <FileUp className="h-3.5 w-3.5" aria-hidden />
              Importer une image ou un PDF
            </Button>
            <Button size="sm" variant="accent" onClick={() => setFormOpen(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Ajouter un événement
            </Button>
          </div>
        </div>

        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="max-w-3xl font-display text-[27px] font-semibold leading-[1.18] tracking-tight text-ink sm:text-[32px]"
        >
          {greeting(user?.firstName ?? '', openConflicts.length, dayEvents.length)}
        </motion.h1>

        <div className="mt-6 flex flex-wrap gap-x-3.5 gap-y-4">
          <MetaItem label="Rendez-vous" value={`${dayEvents.length} aujourd\u2019hui`} />
          <MetaItem label="Temps occupé" value={humanDuration(busyMinutes)} />
          <MetaItem
            label="Prochain"
            value={upcoming ? `${fmtTime(upcoming.start)} · ${upcoming.title}` : 'Plus rien de prévu'}
          />
          <MetaItem
            label="État"
            value={openConflicts.length === 0 ? 'Sous contrôle' : `${openConflicts.length} à trancher`}
            tone={openConflicts.length > 0 ? 'urgent' : undefined}
          />
        </div>
      </header>

      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-label="Chronologie de la journée" className="order-2 min-w-0 lg:order-1">
          <h2 className="mb-3 font-display text-[17px] font-semibold text-ink">Chronologie</h2>
          {dayEvents.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line px-5 py-12 text-center">
              <CalendarClock className="mx-auto mb-2 h-5 w-5 text-ink-faint" aria-hidden />
              <p className="text-sm font-medium text-ink">Aucun événement aujourd&apos;hui</p>
              <p className="mt-1 text-[13px] text-ink-soft">
                Ajoutez-en un ci-dessus, importez un planning, ou demandez au copilote :
                « Crée une réunion aujourd&apos;hui à 15h ».
              </p>
            </div>
          ) : (
            <>
              <DayTimeline day={today} events={events} onOpen={setSelectedEvent} />
              <p className="mt-2.5 flex items-center gap-1.5 text-[12px] text-ink-faint">
                <GitCompareArrows className="h-3 w-3" aria-hidden />
                Faites glisser un bloc pour le déplacer par pas de quinze minutes. La modification part
                dans Google Calendar.
              </p>
            </>
          )}
        </section>

        <aside className="order-1 min-w-0 space-y-3 lg:order-2">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-[17px] font-semibold text-ink">Attention nécessaire</h2>
            <span className="font-numeric text-[11px] text-ink-faint">{openConflicts.length} en cours</span>
          </div>
          <AttentionBlock conflicts={openConflicts} />
        </aside>
      </div>

      <EventDetailSheet event={selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)} />
      <EventFormDialog open={formOpen} onOpenChange={setFormOpen} defaultDate={today} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </PageShell>
  )
}
