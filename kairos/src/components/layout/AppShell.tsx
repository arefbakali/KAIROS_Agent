import { Outlet } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { MobileNav } from './MobileNav'
import { ReminderInitializer } from './ReminderInitializer'
import { CopilotPanel, CopilotSheet } from '@/components/assistant/CopilotPanel'
import { CommandMenu } from '@/components/command-menu/CommandMenu'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { useTheme } from '@/hooks/useTheme'
import { Logo } from './Logo'

export function AppShell() {
  useTheme()
  const copilotMode = useWorkspaceStore((state) => state.copilotMode)
  const setCopilotMode = useWorkspaceStore((state) => state.setCopilotMode)
  const setCommandMenuOpen = useWorkspaceStore((state) => state.setCommandMenuOpen)

  return (
    <div className="flex h-dvh overflow-hidden bg-paper">
      <Sidebar />
      <ReminderInitializer />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line px-4 py-2.5 md:hidden">
          <Logo />
          <button
            onClick={() => setCommandMenuOpen(true)}
            className="ml-auto rounded-sm border border-line px-2.5 py-1 text-[12px] text-ink-soft"
          >
            Rechercher
          </button>
        </header>

        <main className="flex-1 overflow-y-auto pb-20 scroll-slim md:pb-0" id="contenu-principal">
          <Outlet />
        </main>
      </div>

      <CopilotPanel />
      <CopilotSheet />

      {copilotMode === 'ferme' && (
        <button
          onClick={() => setCopilotMode('ancre')}
          className="fixed bottom-6 right-6 z-30 hidden items-center gap-2 rounded-full bg-brand px-4 py-2.5 text-[13px] font-medium text-white ring-brand transition-transform hover:-translate-y-0.5 lg:flex"
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          Ouvrir le copilote
        </button>
      )}

      <MobileNav />
      <CommandMenu />
    </div>
  )
}
