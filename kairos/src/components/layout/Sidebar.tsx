import { NavLink } from 'react-router-dom'
import {
  Bell,
  CalendarDays,
  Command,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Settings,
  Sparkles,
  Sun,
} from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { Logo } from './Logo'
import { Tooltip } from '@/components/ui/tooltip'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { useNotificationStore } from '@/store/useNotificationStore'
import { useSessionStore } from '@/store/useSessionStore'
import { UserMenu } from './UserMenu'

export const navigation = [
  { to: '/', label: 'Aujourd’hui', icon: Sun, end: true },
  { to: '/planning', label: 'Planning', icon: CalendarDays, end: false },
  { to: '/assistant', label: 'Assistant IA', icon: Sparkles, end: false },
  { to: '/notifications', label: 'Notifications', icon: Bell, end: false },
]

const systemNavigation = [
  { to: '/integrations', label: 'Intégrations', icon: Plug },
  { to: '/parametres', label: 'Paramètres', icon: Settings },
]

function StatusLine({
  label,
  state,
  collapsed,
}: {
  label: string
  state: 'actif' | 'attention' | 'inactif'
  collapsed: boolean
}) {
  const dot =
    state === 'actif' ? 'bg-ok' : state === 'attention' ? 'bg-accent' : 'bg-line-strong'
  const text =
    state === 'actif' ? 'Connecté' : state === 'attention' ? 'À vérifier' : 'Déconnecté'

  if (collapsed) {
    return (
      <Tooltip label={`${label} — ${text}`}>
        <div className="flex h-6 items-center justify-center">
          <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
          <span className="sr-only">{`${label} : ${text}`}</span>
        </div>
      </Tooltip>
    )
  }

  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="truncate text-[12px] text-ink-soft">{label}</span>
      <span className="flex items-center gap-1.5">
        <span className={cn('h-1.5 w-1.5 rounded-full', dot)} aria-hidden />
        <span className="text-[11px] text-ink-faint">{text}</span>
      </span>
    </div>
  )
}

export function Sidebar() {
  const collapsed = useWorkspaceStore((state) => state.sidebarCollapsed)
  const toggleSidebar = useWorkspaceStore((state) => state.toggleSidebar)
  const setCommandMenuOpen = useWorkspaceStore((state) => state.setCommandMenuOpen)
  const notifications = useNotificationStore((state) => state.items)

  const calendarConnected = useSessionStore((state) => state.calendarGranted)
  const gmailConnected = useSessionStore((state) => state.gmailGranted)

  const unread = notifications.filter((notification) => !notification.read).length

  return (
    <aside
      className={cn(
        'hidden shrink-0 flex-col border-r border-line bg-paper-deep/60 transition-[width] duration-300 md:flex',
        collapsed ? 'w-[68px]' : 'w-[236px]',
      )}
    >
      <div className={cn('flex items-center justify-between px-4 pb-4 pt-5', collapsed && 'px-3')}>
        <Logo collapsed={collapsed} />
        {!collapsed && (
          <button
            onClick={toggleSidebar}
            className="rounded-xs p-1 text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
            aria-label="Réduire la navigation"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {collapsed && (
        <button
          onClick={toggleSidebar}
          className="mx-auto mb-3 rounded-xs p-1 text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
          aria-label="Déployer la navigation"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      )}

      {!collapsed && (
        <p className="px-4 pb-3 font-numeric text-[11px] uppercase tracking-[0.1em] text-ink-faint">
          {format(new Date(), 'EEEE d MMMM', { locale: fr })}
        </p>
      )}

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 scroll-slim" aria-label="Navigation principale">
        {navigation.map((item) => {
          const Icon = item.icon
          const link = (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-[13.5px] font-medium transition-colors',
                  collapsed && 'justify-center px-0',
                  isActive ? 'bg-surface text-ink shadow-hair' : 'text-ink-soft hover:bg-surface/70 hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'absolute left-0 h-4 w-[2.5px] rounded-full bg-brand transition-opacity',
                      isActive ? 'opacity-100' : 'opacity-0',
                    )}
                    aria-hidden
                  />
                  <Icon className="h-[17px] w-[17px] shrink-0" aria-hidden />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                  {item.to === '/notifications' && unread > 0 && (
                    <span
                      className={cn(
                        'ml-auto rounded-full bg-brand px-1.5 font-numeric text-[10px] font-semibold text-white',
                        collapsed && 'absolute right-2 top-1.5 ml-0 px-1',
                      )}
                    >
                      {unread}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          )

          return collapsed ? (
            <Tooltip key={item.to} label={item.label}>
              <div>{link}</div>
            </Tooltip>
          ) : (
            link
          )
        })}

        <div className="my-3 border-t border-line" />

        {systemNavigation.map((item) => {
          const Icon = item.icon
          const link = (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-[13.5px] font-medium transition-colors',
                  collapsed && 'justify-center px-0',
                  isActive ? 'bg-surface text-ink shadow-hair' : 'text-ink-soft hover:bg-surface/70 hover:text-ink',
                )
              }
            >
              <Icon className="h-[17px] w-[17px] shrink-0" aria-hidden />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          )
          return collapsed ? (
            <Tooltip key={item.to} label={item.label}>
              <div>{link}</div>
            </Tooltip>
          ) : (
            link
          )
        })}
      </nav>

      <div className={cn('space-y-2 border-t border-line px-4 py-3', collapsed && 'px-2')}>
        {!collapsed && <p className="eyebrow">État du système</p>}
        <div className={cn('space-y-0.5', collapsed && 'space-y-2')}>
          <StatusLine label="Agent KAIROS" state="actif" collapsed={collapsed} />
          <StatusLine
            label="Google Calendar"
            state={calendarConnected ? 'actif' : 'inactif'}
            collapsed={collapsed}
          />
          <StatusLine label="Gmail" state={gmailConnected ? 'actif' : 'attention'} collapsed={collapsed} />
        </div>
      </div>

      <div className={cn('border-t border-line px-3 py-3', collapsed && 'px-2')}>
        <button
          onClick={() => setCommandMenuOpen(true)}
          className={cn(
            'mb-2 flex w-full items-center gap-2 rounded-sm border border-line bg-surface px-2.5 py-1.5 text-[12.5px] text-ink-soft transition-colors hover:border-line-strong hover:text-ink',
            collapsed && 'justify-center px-0',
          )}
        >
          <Command className="h-3.5 w-3.5" aria-hidden />
          {!collapsed && (
            <>
              <span>Commandes</span>
              <kbd className="ml-auto font-numeric text-[10px] text-ink-faint">Ctrl K</kbd>
            </>
          )}
        </button>

        <UserMenu collapsed={collapsed} />
      </div>
    </aside>
  )
}
