import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Command } from 'cmdk'
import { Bell, CalendarDays, FileUp, Plug, Plus, RefreshCw, Search, Settings, Sparkles, Sun } from 'lucide-react'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { useHotkey } from '@/hooks/useHotkey'
import { useGoogleSync } from '@/hooks/useGoogle'
import { useAssistantStore } from '@/store/useAssistantStore'

export function CommandMenu() {
  const open = useWorkspaceStore((state) => state.commandMenuOpen)
  const setOpen = useWorkspaceStore((state) => state.setCommandMenuOpen)
  const setCopilotMode = useWorkspaceStore((state) => state.setCopilotMode)
  const setDraft = useAssistantStore((state) => state.setDraft)
  const navigate = useNavigate()
  const sync = useGoogleSync()

  useHotkey({ key: 'k', onTrigger: () => setOpen(!open) })

  const run = useCallback(
    (action: () => void) => {
      setOpen(false)
      action()
    },
    [setOpen],
  )

  /** Prépare une demande dans le copilote plutôt que d'agir sans confirmation. */
  const demander = (texte: string) =>
    run(() => {
      setCopilotMode('ancre')
      setDraft(texte)
    })

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Palette de commandes"
      contentClassName="fixed left-1/2 top-[18vh] z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 overflow-hidden rounded-lg border border-line bg-surface shadow-float"
      overlayClassName="fixed inset-0 z-50 bg-ink/25 backdrop-blur-[2px]"
    >
      <div className="flex items-center gap-2 border-b border-line px-4">
        <Search className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
        <Command.Input
          placeholder="Rechercher une action…"
          className="h-12 w-full bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
        />
        <kbd className="font-numeric text-[10px] text-ink-faint">Échap</kbd>
      </div>

      <Command.List className="max-h-[52vh] overflow-y-auto p-2 scroll-slim">
        <Command.Empty className="px-3 py-6 text-center text-[13px] text-ink-soft">
          Aucun résultat.
        </Command.Empty>

        <Command.Group
          heading="Agenda"
          className="[&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
        >
          <Item
            icon={Plus}
            label="Ajouter un événement (formulaire)"
            onSelect={() => run(() => navigate('/?nouvel-evenement=1'))}
          />
          <Item
            icon={FileUp}
            label="Importer une image ou un PDF"
            onSelect={() => run(() => navigate('/?import=1'))}
          />
          <Item
            icon={Sparkles}
            label="Créer un événement…"
            hint="via le copilote"
            onSelect={() => demander('Crée une réunion demain à 15h pendant une heure')}
          />
          <Item
            icon={Sparkles}
            label="Supprimer un événement…"
            hint="via le copilote"
            onSelect={() => demander('Supprime ma réunion de demain à 15h')}
          />
          <Item icon={Sparkles} label="Résumer ma journée" onSelect={() => demander('Résume ma journée')} />
          <Item icon={Sparkles} label="Afficher mes conflits" onSelect={() => demander('Quels sont mes conflits ?')} />
          <Item icon={RefreshCw} label="Synchroniser Google Calendar" onSelect={() => run(() => sync.mutate())} />
        </Command.Group>

        <Command.Group
          heading="Naviguer"
          className="[&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
        >
          <Item icon={Sun} label="Aujourd&apos;hui" onSelect={() => run(() => navigate('/'))} />
          <Item icon={CalendarDays} label="Planning" onSelect={() => run(() => navigate('/planning'))} />
          <Item icon={Bell} label="Notifications" onSelect={() => run(() => navigate('/notifications'))} />
          <Item icon={Plug} label="Intégrations" onSelect={() => run(() => navigate('/integrations'))} />
          <Item icon={Settings} label="Paramètres" onSelect={() => run(() => navigate('/parametres'))} />
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  )
}

function Item({
  icon: Icon,
  label,
  hint,
  onSelect,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  hint?: string
  onSelect: () => void
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2.5 rounded-sm px-2.5 py-2 text-[13.5px] text-ink-2 data-[selected=true]:bg-surface-2 data-[selected=true]:text-ink"
    >
      <Icon className="h-3.5 w-3.5 text-ink-faint" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && <span className="font-numeric text-[11px] text-ink-faint">{hint}</span>}
    </Command.Item>
  )
}
