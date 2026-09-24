import { useEffect, useMemo, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Maximize2, Minimize2, PictureInPicture2, Sparkles, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { useAssistantStore } from '@/store/useAssistantStore'
import { suggestionsFor, type AssistantContext } from './contexte'
import { AssistantBlockView } from './AssistantBlocks'
import { Composer } from './Composer'
import { fmtTime } from '@/lib/time'
import { Tooltip } from '@/components/ui/tooltip'

const CONTEXT_BY_PATH: Record<string, AssistantContext> = {
  '/': 'aujourdhui',
  '/planning': 'planning',
  '/assistant': 'aujourdhui',
  '/notifications': 'notifications',
  '/integrations': 'integrations',
  '/parametres': 'parametres',
}

const CONTEXT_HINT: Record<AssistantContext, string> = {
  aujourdhui: 'Lecture de votre journée',
  planning: 'Lecture de votre semaine',
  notifications: 'Lecture des points à traiter',
  integrations: 'Lecture de l’état des connexions',
  parametres: 'Lecture de vos préférences',
}

export function useAssistantContext(): AssistantContext {
  const { pathname } = useLocation()
  return CONTEXT_BY_PATH[pathname] ?? 'aujourdhui'
}

export function Conversation({ dense = false }: { dense?: boolean }) {
  const messages = useAssistantStore((state) => state.messages)
  const thinking = useAssistantStore((state) => state.thinking)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, thinking])

  return (
    <div className={cn('space-y-5', dense ? 'px-4 py-4' : 'px-6 py-6')}>
      {messages.map((message) => (
        <motion.article
          key={message.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: 'easeOut' }}
          className={cn('space-y-2', message.role === 'utilisateur' && 'pl-8')}
        >
          <header className="flex items-center gap-2">
            <span className="eyebrow">{message.role === 'agent' ? 'KAIROS' : 'Vous'}</span>
            <span className="font-numeric text-[10px] text-ink-faint">{fmtTime(message.createdAt)}</span>
          </header>
          <div
            className={cn(
              'space-y-2.5',
              message.role === 'utilisateur' &&
                'rounded-md rounded-tr-xs border border-line bg-surface-2 px-3.5 py-2.5',
            )}
          >
            {message.blocks.map((block, index) => (
              <AssistantBlockView key={`${message.id}-${index}`} block={block} />
            ))}
          </div>
        </motion.article>
      ))}

      <AnimatePresence>
        {thinking && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 text-[13px] text-ink-faint"
          >
            <span className="flex gap-1" aria-hidden>
              {[0, 1, 2].map((index) => (
                <motion.span
                  key={index}
                  className="h-1.5 w-1.5 rounded-full bg-accent"
                  animate={{ opacity: [0.25, 1, 0.25] }}
                  transition={{ duration: 1.1, repeat: Infinity, delay: index * 0.16 }}
                />
              ))}
            </span>
            KAIROS analyse votre planning…
          </motion.div>
        )}
      </AnimatePresence>
      <div ref={endRef} />
    </div>
  )
}

export function CopilotPanel() {
  const mode = useWorkspaceStore((state) => state.copilotMode)
  const setMode = useWorkspaceStore((state) => state.setCopilotMode)
  const context = useAssistantContext()
  const suggestions = useMemo(() => suggestionsFor(context), [context])

  if (mode === 'ferme') return null

  const isFloating = mode === 'flottant'

  const width =
    mode === 'reduit' ? 'w-[300px]' : mode === 'plein' ? 'w-[520px]' : 'w-[380px]'

  return (
    <AnimatePresence>
      <motion.aside
        key="copilote"
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 24 }}
        transition={{ duration: 0.26, ease: 'easeOut' }}
        aria-label="Copilote KAIROS"
        className={cn(
          'flex shrink-0 flex-col border-line bg-surface',
          isFloating
            ? 'fixed bottom-5 right-5 z-40 h-[560px] w-[380px] rounded-lg border shadow-float'
            : cn('hidden border-l lg:flex', width),
          mode === 'plein' && !isFloating && 'lg:w-[520px]',
        )}
      >
        <header className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="grid h-7 w-7 place-items-center rounded-sm bg-accent-soft text-accent">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-[13.5px] font-medium text-ink">Copilote</p>
            <p className="truncate text-[11px] text-ink-faint">{CONTEXT_HINT[context]}</p>
          </div>
          <Tooltip label={mode === 'plein' ? 'Réduire la largeur' : 'Agrandir'} side="bottom">
            <button
              onClick={() => setMode(mode === 'plein' ? 'ancre' : 'plein')}
              className="rounded-xs p-1.5 text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
              aria-label={mode === 'plein' ? 'Réduire la largeur du copilote' : 'Agrandir le copilote'}
            >
              {mode === 'plein' ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          </Tooltip>
          <Tooltip label={isFloating ? 'Ancrer à droite' : 'Fenêtre flottante'} side="bottom">
            <button
              onClick={() => setMode(isFloating ? 'ancre' : 'flottant')}
              className="rounded-xs p-1.5 text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
              aria-label={isFloating ? 'Ancrer le copilote à droite' : 'Détacher le copilote'}
            >
              <PictureInPicture2 className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
          <button
            onClick={() => setMode('ferme')}
            className="rounded-xs p-1.5 text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
            aria-label="Fermer le copilote"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto scroll-slim">
          <Conversation dense />
        </div>

        <Composer suggestions={suggestions} context={context} />
      </motion.aside>
    </AnimatePresence>
  )
}

/** Version plein écran du copilote sur mobile. */
export function CopilotSheet() {
  const mode = useWorkspaceStore((state) => state.copilotMode)
  const setMode = useWorkspaceStore((state) => state.setCopilotMode)
  const context = useAssistantContext()
  const suggestions = useMemo(() => suggestionsFor(context), [context])

  return (
    <AnimatePresence>
      {mode === 'plein' && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.22 }}
          className="fixed inset-0 z-50 flex flex-col bg-surface lg:hidden"
          role="dialog"
          aria-label="Copilote KAIROS"
        >
          <header className="flex items-center gap-2 border-b border-line px-4 py-3">
            <Sparkles className="h-4 w-4 text-accent" aria-hidden />
            <p className="flex-1 text-sm font-medium text-ink">Copilote</p>
            <button
              onClick={() => setMode('ferme')}
              className="rounded-xs p-1.5 text-ink-faint hover:bg-surface-2 hover:text-ink"
              aria-label="Fermer le copilote"
            >
              <X className="h-4 w-4" />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto scroll-slim">
            <Conversation dense />
          </div>
          <Composer suggestions={suggestions} context={context} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
