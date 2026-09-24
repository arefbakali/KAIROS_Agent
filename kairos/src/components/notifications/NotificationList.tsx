import { motion } from 'framer-motion'
import { Bell, CheckCheck, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { fmtRelativeDate } from '@/lib/time'
import { cn } from '@/lib/utils'
import {
  notificationStyle,
  useNotificationStore,
  type AppNotification,
  type NotificationCategory,
} from '@/store/useNotificationStore'

const ORDRE: NotificationCategory[] = [
  'erreur-google',
  'conflit',
  'action-impossible',
  'evenement-cree',
  'evenement-supprime',
  'synchronisation',
]

export function NotificationList({
  items,
  filter,
  onFilterChange,
}: {
  items: AppNotification[]
  filter: NotificationCategory | 'toutes'
  onFilterChange: (value: NotificationCategory | 'toutes') => void
}) {
  const markRead = useNotificationStore((state) => state.markRead)
  const markAllRead = useNotificationStore((state) => state.markAllRead)
  const remove = useNotificationStore((state) => state.remove)
  const clear = useNotificationStore((state) => state.clear)

  const filtered = filter === 'toutes' ? items : items.filter((item) => item.category === filter)

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line px-5 py-14 text-center">
        <Bell className="mx-auto mb-2 h-5 w-5 text-ink-faint" aria-hidden />
        <p className="text-sm font-medium text-ink">Aucune notification pour l&apos;instant</p>
        <p className="mt-1 text-[13px] text-ink-soft">
          Créez ou supprimez un événement depuis le copilote : chaque opération sera journalisée ici.
        </p>
      </div>
    )
  }

  const presentes = ORDRE.filter((categorie) => items.some((item) => item.category === categorie))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-1.5">
        {(['toutes', ...presentes] as const).map((value) => (
          <button
            key={value}
            onClick={() => onFilterChange(value)}
            aria-pressed={filter === value}
            className={cn(
              'rounded-full border px-3 py-1 text-[12.5px] transition-colors',
              filter === value
                ? 'border-ink bg-ink text-paper'
                : 'border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink',
            )}
          >
            {value === 'toutes' ? 'Toutes' : notificationStyle[value].label}
          </button>
        ))}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={markAllRead}>
          <CheckCheck className="h-3.5 w-3.5" aria-hidden />
          Tout marquer comme lu
        </Button>
        <Button size="sm" variant="ghost" onClick={clear}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          Vider
        </Button>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-faint">
          Rien dans cette catégorie.
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((notification) => {
            const style = notificationStyle[notification.category]
            return (
              <motion.article
                key={notification.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  'flex flex-wrap items-start gap-3 rounded-lg border bg-surface p-4',
                  notification.read ? 'border-line opacity-70' : 'border-line-strong',
                )}
              >
                {!notification.read && (
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-label="Non lue" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[14px] font-medium text-ink">{notification.title}</h3>
                    <Badge tone={style.tone}>{style.label}</Badge>
                  </div>
                  <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-ink-soft">
                    {notification.body}
                  </p>
                  <p className="mt-1.5 font-numeric text-[11px] text-ink-faint">
                    {fmtRelativeDate(notification.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {!notification.read && (
                    <Button size="sm" variant="ghost" onClick={() => markRead(notification.id)}>
                      Marquer comme lue
                    </Button>
                  )}
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Supprimer la notification"
                    onClick={() => remove(notification.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </motion.article>
            )
          })}
        </div>
      )}
    </div>
  )
}
