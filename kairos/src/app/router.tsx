import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { RequireSession } from '@/components/layout/RequireSession'
import { SignInPage } from '@/pages/SignInPage'
import { TodayPage } from '@/pages/TodayPage'
import { CalendarPage } from '@/pages/CalendarPage'
import { AssistantPage } from '@/pages/AssistantPage'
import { NotificationsPage } from '@/pages/NotificationsPage'
import { IntegrationsPage } from '@/pages/IntegrationsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

export const router = createBrowserRouter([
  { path: '/connexion', element: <SignInPage /> },
  {
    path: '/',
    element: (
      <RequireSession>
        <AppShell />
      </RequireSession>
    ),
    children: [
      { index: true, element: <TodayPage /> },
      { path: 'planning', element: <CalendarPage /> },
      { path: 'assistant', element: <AssistantPage /> },
      { path: 'notifications', element: <NotificationsPage /> },
      { path: 'integrations', element: <IntegrationsPage /> },
      { path: 'parametres', element: <SettingsPage /> },
      { path: 'aujourdhui', element: <Navigate to="/" replace /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
