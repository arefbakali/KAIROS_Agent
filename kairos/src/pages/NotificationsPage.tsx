import { useState } from 'react'
import { PageHeader, PageShell } from '@/components/layout/PageHeader'
import { NotificationList } from '@/components/notifications/NotificationList'
import { useNotificationStore, type NotificationCategory } from '@/store/useNotificationStore'

export function NotificationsPage() {
  const items = useNotificationStore((state) => state.items)
  const [filter, setFilter] = useState<NotificationCategory | 'toutes'>('toutes')

  const unread = items.filter((item) => !item.read).length

  return (
    <PageShell className="max-w-[900px]">
      <PageHeader
        eyebrow="Notifications"
        title="Ce que KAIROS a fait, et ce qui a échoué"
        description={
          items.length === 0
            ? "Le journal se remplit dès que l'agent crée, supprime ou refuse une opération."
            : `${unread} non lue${unread > 1 ? 's' : ''} sur ${items.length} entrée${items.length > 1 ? 's' : ''}.`
        }
      />
      <NotificationList items={items} filter={filter} onFilterChange={setFilter} />
    </PageShell>
  )
}
