import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useIsAuthenticated } from '@/store/useSessionStore'

/** Toute route applicative exige une session Google valide. */
export function RequireSession({ children }: { children: ReactNode }) {
  const authenticated = useIsAuthenticated()
  const location = useLocation()

  if (!authenticated) {
    return <Navigate to="/connexion" replace state={{ from: location.pathname }} />
  }

  return <>{children}</>
}
