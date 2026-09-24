import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type CopilotMode = 'ancre' | 'reduit' | 'plein' | 'flottant' | 'ferme'
export type ThemeMode = 'clair' | 'sombre' | 'systeme'

interface WorkspaceState {
  sidebarCollapsed: boolean
  copilotMode: CopilotMode
  commandMenuOpen: boolean
  theme: ThemeMode
  comparisonEnabled: boolean
  toggleSidebar: () => void
  setCopilotMode: (mode: CopilotMode) => void
  toggleCopilot: () => void
  setCommandMenuOpen: (open: boolean) => void
  setTheme: (theme: ThemeMode) => void
  setComparisonEnabled: (enabled: boolean) => void
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      copilotMode: 'ancre',
      commandMenuOpen: false,
      theme: 'systeme',
      comparisonEnabled: false,
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      setCopilotMode: (copilotMode) => set({ copilotMode }),
      toggleCopilot: () => set({ copilotMode: get().copilotMode === 'ferme' ? 'ancre' : 'ferme' }),
      setCommandMenuOpen: (commandMenuOpen) => set({ commandMenuOpen }),
      setTheme: (theme) => set({ theme }),
      setComparisonEnabled: (comparisonEnabled) => set({ comparisonEnabled }),
    }),
    {
      name: 'kairos-workspace',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        copilotMode: state.copilotMode,
        theme: state.theme,
      }),
    },
  ),
)
