import { NavLink } from 'react-router-dom'
import { Bell, CalendarDays, Sparkles, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { useNotificationStore } from '@/store/useNotificationStore'

const items = [
  { to: '/', label: 'Aujourd’hui', icon: Sun },
  { to: '/planning', label: 'Planning', icon: CalendarDays },
  { to: '/notifications', label: 'Alertes', icon: Bell },
]

export function MobileNav() {
  const setCopilotMode = useWorkspaceStore((state) => state.setCopilotMode)
  const notifications = useNotificationStore((state) => state.items)
  const unread = notifications.filter((notification) => !notification.read).length

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      aria-label="Navigation principale"
    >
      {items.map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                isActive ? 'text-ink' : 'text-ink-faint',
              )
            }
          >
            <Icon className="h-[19px] w-[19px]" aria-hidden />
            {item.to === '/notifications' && unread > 0 && (
              <span className="absolute right-[26%] top-1.5 h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            )}
            <span>{item.label}</span>
          </NavLink>
        )
      })}
      <button
        onClick={() => setCopilotMode('plein')}
        className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-accent"
      >
        <Sparkles className="h-[19px] w-[19px]" aria-hidden />
        <span>Copilote</span>
      </button>
    </nav>
  )
}
