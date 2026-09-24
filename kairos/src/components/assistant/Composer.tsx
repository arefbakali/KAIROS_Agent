import { useCallback, useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { ArrowUp, MicOff, Mic, Paperclip } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAssistantStore } from '@/store/useAssistantStore'
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition'
import { AgentUnavailable, agentApi, agentConfigured } from '@/services/agent.service'
import { journaliserReponse } from './AssistantBlocks'
import { notify } from '@/store/useNotificationStore'
import type { AssistantContext } from './contexte'
import { useEvents } from '@/hooks/useWorkspaceData'
import { useCurrentUser } from '@/store/useSessionStore'

export function Composer({ suggestions }: { suggestions: string[]; context?: AssistantContext }) {
  const draft = useAssistantStore((state) => state.draft)
  const setDraft = useAssistantStore((state) => state.setDraft)
  const append = useAssistantStore((state) => state.append)
  const thinking = useAssistantStore((state) => state.thinking)
  const setThinking = useAssistantStore((state) => state.setThinking)
  const [attachment, setAttachment] = useState<string | null>(null)
  const { data: events } = useEvents()
  const user = useCurrentUser()

  const onTranscript = useCallback((text: string) => setDraft(text), [setDraft])
  const { supported, listening, start, stop } = useSpeechRecognition(onTranscript)

  async function submit(value: string) {
    const message = value.trim()
    if (!message || thinking) return

    append({
      id: `local_${Date.now()}`,
      role: 'utilisateur',
      createdAt: new Date().toISOString(),
      blocks: [{ type: 'texte', content: message }],
    })
    setDraft('')
    setAttachment(null)
    setThinking(true)

    try {
      if (!agentConfigured) {
        throw new AgentUnavailable(
          'Aucun back-end configuré. Renseignez VITE_AGENT_API_URL dans le fichier .env.',
        )
      }
      // L'agent lit les événements déjà chargés depuis Google Calendar.
      const reply = await agentApi.chat(message, events ?? [], user?.firstName)
      append(agentApi.toMessage(reply))
      journaliserReponse(reply.blocks)
    } catch (error) {
      const detail =
        error instanceof AgentUnavailable
          ? error.message
          : 'Réessayez dans un instant ; aucune modification n\u2019a été enregistrée.'
      notify({ category: 'action-impossible', title: 'Le copilote est indisponible', body: detail })
      toast.error('Le copilote est indisponible', {
        description:
          error instanceof AgentUnavailable
            ? error.message
            : 'Réessayez dans un instant ; aucune modification n\u2019a été enregistrée.',
      })
    } finally {
      setThinking(false)
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    void submit(draft)
  }

  return (
    <div className="border-t border-line bg-surface px-3 pb-3 pt-2.5">
      <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1 scroll-slim">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => void submit(suggestion)}
            className="shrink-0 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11.5px] text-ink-soft transition-colors hover:border-accent/40 hover:text-ink"
          >
            {suggestion}
          </button>
        ))}
      </div>

      {listening && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mb-2 flex items-center gap-2 rounded-sm border border-accent/30 bg-accent-soft/60 px-2.5 py-1.5"
        >
          <span className="flex items-end gap-[3px]" aria-hidden>
            {[0, 1, 2, 3].map((index) => (
              <motion.span
                key={index}
                className="w-[3px] rounded-full bg-accent"
                animate={{ height: [5, 14, 7, 12, 5] }}
                transition={{ duration: 1, repeat: Infinity, delay: index * 0.1 }}
              />
            ))}
          </span>
          <span className="text-[12px] text-accent-ink">Écoute en cours — parlez, puis vérifiez le texte.</span>
        </motion.div>
      )}

      {attachment && (
        <div className="mb-2 flex items-center gap-2 rounded-sm border border-line bg-surface-2 px-2.5 py-1.5 text-[12px] text-ink-soft">
          <Paperclip className="h-3 w-3" aria-hidden />
          {attachment}
          <button onClick={() => setAttachment(null)} className="ml-auto text-ink-faint hover:text-ink">
            Retirer
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="rounded-md border border-line-strong bg-surface focus-within:border-accent">
        <label htmlFor="copilot-input" className="sr-only">
          Écrire au copilote
        </label>
        <textarea
          id="copilot-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void submit(draft)
            }
          }}
          rows={2}
          placeholder="Demandez une réorganisation, un créneau, une explication…"
          className="w-full resize-none bg-transparent px-3 pt-2.5 text-[13.5px] text-ink placeholder:text-ink-faint focus:outline-none"
        />
        <div className="flex items-center gap-1 px-2 pb-2">
          <button
            type="button"
            onClick={() => setAttachment('planning-semaine.ics')}
            className="rounded-xs p-1.5 text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
            aria-label="Joindre un fichier simulé"
          >
            <Paperclip className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (!supported) {
                toast('Dictée indisponible', {
                  description: 'Ce navigateur ne prend pas en charge la reconnaissance vocale. La saisie clavier reste disponible.',
                })
                return
              }
              listening ? stop() : start()
            }}
            aria-pressed={listening}
            className={cn(
              'rounded-xs p-1.5 transition-colors',
              listening ? 'bg-accent-soft text-accent' : 'text-ink-faint hover:bg-surface-2 hover:text-ink',
              !supported && 'opacity-50',
            )}
            aria-label={listening ? 'Arrêter la dictée' : 'Dicter une demande'}
          >
            {supported ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
          </button>
          <span className="ml-1 hidden text-[11px] text-ink-faint sm:inline">
            Entrée pour envoyer · Maj + Entrée pour un retour à la ligne
          </span>
          <Button
            type="submit"
            size="icon-sm"
            variant="accent"
            className="ml-auto"
            disabled={!draft.trim() || thinking}
            aria-label="Envoyer la demande"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
        </div>
      </form>
    </div>
  )
}
