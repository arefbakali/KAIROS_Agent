import { useNavigate } from 'react-router-dom'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronsUpDown, LogOut, Plug, Settings } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { initials, useCurrentUser } from '@/store/useSessionStore'
import { useSignOut } from '@/hooks/useGoogle'

export function UserMenu({ collapsed = false }: { collapsed?: boolean }) {
  const user = useCurrentUser()
  const signOut = useSignOut()
  const navigate = useNavigate()

  if (!user) return null

  async function handleSignOut() {
    await signOut.mutateAsync().catch(() => undefined)
    toast('Déconnecté', { description: 'Votre jeton Google a été révoqué.' })
    navigate('/connexion', { replace: true })
  }

  const avatar = user.avatarUrl ? (
    <img
      src={user.avatarUrl}
      alt=""
      referrerPolicy="no-referrer"
      className="h-7 w-7 shrink-0 rounded-full object-cover"
    />
  ) : (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink font-numeric text-[11px] font-medium text-paper">
      {initials(user)}
    </span>
  )

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={cn(
          'flex w-full items-center gap-2.5 rounded-sm px-1.5 py-1.5 text-left transition-colors hover:bg-surface',
          collapsed && 'justify-center px-0',
        )}
        aria-label="Menu du compte"
      >
        {avatar}
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[13px] font-medium text-ink">
                {user.firstName} {user.lastName}
              </span>
              <span className="block truncate text-[11px] text-ink-faint">{user.email}</span>
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
          </>
        )}
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="start"
          sideOffset={8}
          className="z-50 w-60 rounded-md border border-line bg-surface p-1.5 shadow-float"
        >
          <div className="flex items-center gap-2.5 px-2 py-2">
            {avatar}
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[13px] font-medium text-ink">
                {user.firstName} {user.lastName}
              </p>
              <p className="truncate text-[11.5px] text-ink-faint">{user.email}</p>
            </div>
          </div>

          <div className="my-1 h-px bg-line" />

          <DropdownMenu.Item
            onSelect={() => navigate('/integrations')}
            className="flex cursor-pointer items-center gap-2.5 rounded-xs px-2 py-1.5 text-[13px] text-ink-2 outline-none data-[highlighted]:bg-surface-2"
          >
            <Plug className="h-3.5 w-3.5 text-ink-faint" aria-hidden />
            Intégrations Google
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => navigate('/parametres')}
            className="flex cursor-pointer items-center gap-2.5 rounded-xs px-2 py-1.5 text-[13px] text-ink-2 outline-none data-[highlighted]:bg-surface-2"
          >
            <Settings className="h-3.5 w-3.5 text-ink-faint" aria-hidden />
            Paramètres
          </DropdownMenu.Item>


          <div className="my-1 h-px bg-line" />

          <DropdownMenu.Item
            onSelect={() => void handleSignOut()}
            className="flex cursor-pointer items-center gap-2.5 rounded-xs px-2 py-1.5 text-[13px] text-urgent outline-none data-[highlighted]:bg-urgent-soft"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            Se déconnecter
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
