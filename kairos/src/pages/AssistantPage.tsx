import { useMemo } from 'react'
import { PageHeader, PageShell } from '@/components/layout/PageHeader'
import { Conversation } from '@/components/assistant/CopilotPanel'
import { Composer } from '@/components/assistant/Composer'
import { suggestionsFor } from '@/components/assistant/contexte'

/** Vue plein cadre du copilote, pour les échanges longs. */
export function AssistantPage() {
  const suggestions = useMemo(() => suggestionsFor('aujourdhui'), [])

  return (
    <PageShell className="max-w-[860px]">
      <PageHeader
        eyebrow="Assistant"
        title="Parlez-lui comme à un collègue qui connaît votre agenda"
        description="Le copilote propose toujours avant d'agir : rien n'est écrit dans Google Calendar sans votre confirmation."
      />

      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <div className="max-h-[58vh] overflow-y-auto scroll-slim">
          <Conversation />
        </div>
        <Composer suggestions={suggestions} context="aujourdhui" />
      </div>
    </PageShell>
  )
}
