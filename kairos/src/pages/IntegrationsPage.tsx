import { CalendarDays, Check, Mail, MailCheck, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react'
import { PageHeader, PageShell } from '@/components/layout/PageHeader'
import { GoogleSetupGuide } from '@/components/integrations/GoogleSetupGuide'
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SkeletonPage } from '@/components/ui/skeleton'
import {
  useGmailInvitations,
  useGoogleCalendars,
  useGoogleSync,
  useRequestScopes,
  useSendMail,
} from '@/hooks/useGoogle'
import { useCurrentUser, useSessionStore } from '@/store/useSessionStore'
import { fmtRelativeDate } from '@/lib/time'
import { initials } from '@/store/useSessionStore'

export function IntegrationsPage() {
  const user = useCurrentUser()
  const calendarGranted = useSessionStore((state) => state.calendarGranted)
  const gmailGranted = useSessionStore((state) => state.gmailGranted)
  const grantedScopes = useSessionStore((state) => state.grantedScopes)
  const lastSyncAt = useSessionStore((state) => state.lastSyncAt)

  const sync = useGoogleSync()
  const requestScopes = useRequestScopes()
  const sendMail = useSendMail()
  const { data: calendars, isLoading: calendarsLoading } = useGoogleCalendars()
  const { data: invitations, isLoading: invitationsLoading, error: invitationsError } = useGmailInvitations()

  if (!user) {
    return (
      <PageShell>
        <SkeletonPage />
      </PageShell>
    )
  }

  return (
    <PageShell className="max-w-[900px]">
      <PageHeader
        eyebrow="Intégrations"
        title="Votre compte Google, branché"
        description="KAIROS lit et écrit directement dans les services autorisés ci-dessous. Vous pouvez révoquer chaque accès à tout moment depuis votre compte Google."
      />

      {/* Compte connecté */}
      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-lg border border-line bg-surface p-5">
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="h-11 w-11 rounded-full object-cover"
          />
        ) : (
          <span className="grid h-11 w-11 place-items-center rounded-full bg-brand font-numeric text-[14px] font-semibold text-white">
            {initials(user)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium text-ink">
            {user.firstName} {user.lastName}
          </p>
          <p className="truncate text-[13px] text-ink-soft">{user.email}</p>
        </div>
        <div className="text-right">
          <p className="eyebrow mb-1">Dernière lecture</p>
          <p className="font-numeric text-[12px] text-ink-2">
            {lastSyncAt ? fmtRelativeDate(lastSyncAt) : 'jamais'}
          </p>
        </div>
        <Button size="sm" variant="outline" loading={sync.isPending} onClick={() => sync.mutate()}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Synchroniser
        </Button>
      </div>

      <div className="space-y-5">
        {/* Google Calendar */}
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-sm bg-focus-soft text-focus">
                <CalendarDays className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <CardTitle>Google Calendar</CardTitle>
                <p className="mt-0.5 text-[13px] text-ink-soft">
                  Source unique des événements affichés dans KAIROS
                </p>
              </div>
            </div>
            <Badge tone={calendarGranted ? 'ok' : 'urgent'}>
              {calendarGranted ? 'Autorisé' : 'Non autorisé'}
            </Badge>
          </CardHeader>

          <CardBody className="space-y-4">
            {!calendarGranted ? (
              <p className="flex items-start gap-2.5 rounded-md border border-urgent/25 bg-urgent-soft px-3.5 py-3 text-[13px] leading-relaxed text-urgent">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Sans cet accès, KAIROS ne peut afficher aucun événement. Relancez l&apos;autorisation
                pour débloquer la lecture et l&apos;écriture du calendrier.
              </p>
            ) : (
              <div>
                <p className="eyebrow mb-2">Calendriers de votre compte</p>
                {calendarsLoading ? (
                  <p className="text-[13px] text-ink-faint">Lecture en cours…</p>
                ) : (
                  <ul className="space-y-1.5">
                    {(calendars ?? []).map((calendar) => (
                      <li key={calendar.id} className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-[13.5px] text-ink-2">{calendar.name}</span>
                        <Badge tone={calendar.selected ? 'accent' : 'neutre'}>
                          {calendar.selected ? 'Principal' : 'Secondaire'}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div>
              <p className="eyebrow mb-2">Portées accordées</p>
              <div className="flex flex-wrap gap-1.5">
                {grantedScopes
                  .filter((scope) => scope.includes('calendar'))
                  .map((scope) => (
                    <Badge key={scope} tone="neutre">
                      <ShieldCheck className="h-3 w-3" aria-hidden />
                      {scope.replace('https://www.googleapis.com/auth/', '')}
                    </Badge>
                  ))}
                {grantedScopes.filter((scope) => scope.includes('calendar')).length === 0 && (
                  <span className="text-[13px] text-ink-faint">Aucune</span>
                )}
              </div>
            </div>
          </CardBody>

          {!calendarGranted && (
            <CardFooter>
              <Button
                size="sm"
                variant="accent"
                loading={requestScopes.isPending}
                onClick={() => requestScopes.mutate()}
              >
                <Check className="h-3.5 w-3.5" aria-hidden />
                Autoriser le calendrier
              </Button>
            </CardFooter>
          )}
        </Card>

        {/* Gmail */}
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-sm bg-accent-soft text-accent">
                <Mail className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <CardTitle>Gmail</CardTitle>
                <p className="mt-0.5 text-[13px] text-ink-soft">
                  Détection des invitations et envoi des rappels
                </p>
              </div>
            </div>
            <Badge tone={gmailGranted ? 'ok' : 'urgent'}>
              {gmailGranted ? 'Autorisé' : 'Non autorisé'}
            </Badge>
          </CardHeader>

          <CardBody className="space-y-4">
            {!gmailGranted ? (
              <p className="flex items-start gap-2.5 rounded-md border border-urgent/25 bg-urgent-soft px-3.5 py-3 text-[13px] leading-relaxed text-urgent">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Sans cet accès, KAIROS ne repère pas les engagements reçus par courriel et ne peut
                envoyer aucun rappel.
              </p>
            ) : (
              <div>
                <p className="eyebrow mb-2">Invitations repérées sur sept jours</p>
                {invitationsLoading ? (
                  <p className="text-[13px] text-ink-faint">Lecture de la boîte de réception…</p>
                ) : invitationsError ? (
                  <p className="rounded-md border border-line bg-surface-2 px-3.5 py-3 text-[13px] text-ink-soft">
                    La lecture a échoué : {(invitationsError as Error).message}
                  </p>
                ) : invitations && invitations.length > 0 ? (
                  <ul className="divide-y divide-line overflow-hidden rounded-md border border-line">
                    {invitations.map((mail) => (
                      <li key={mail.id} className="px-3.5 py-2.5">
                        <p className="truncate text-[13.5px] font-medium text-ink">{mail.subject}</p>
                        <p className="truncate text-[12.5px] text-ink-soft">{mail.from}</p>
                        <p className="mt-0.5 font-numeric text-[11px] text-ink-faint">
                          {fmtRelativeDate(mail.receivedAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-md border border-dashed border-line px-3.5 py-3 text-[13px] text-ink-faint">
                    Aucune invitation trouvée sur la période. KAIROS continue de surveiller.
                  </p>
                )}
              </div>
            )}
          </CardBody>

          <CardFooter>
            {gmailGranted ? (
              <Button
                size="sm"
                variant="outline"
                loading={sendMail.isPending}
                onClick={() =>
                  sendMail.mutate({
                    to: user.email,
                    subject: 'Votre résumé KAIROS',
                    body: `Bonjour ${user.firstName},\n\nCeci est le résumé quotidien envoyé par KAIROS depuis votre propre compte Gmail.\n\n— KAIROS`,
                  })
                }
              >
                <MailCheck className="h-3.5 w-3.5" aria-hidden />
                M&apos;envoyer un résumé de test
              </Button>
            ) : (
              <Button
                size="sm"
                variant="accent"
                loading={requestScopes.isPending}
                onClick={() => requestScopes.mutate()}
              >
                <Check className="h-3.5 w-3.5" aria-hidden />
                Autoriser Gmail
              </Button>
            )}
          </CardFooter>
        </Card>

        <GoogleSetupGuide />

        <p className="text-[12.5px] leading-relaxed text-ink-faint">
          KAIROS utilise le flux OAuth implicite du navigateur : aucun secret client n&apos;est stocké
          dans l&apos;application, et le jeton d&apos;accès reste en mémoire de session pour une heure
          environ. Lorsque le back-end FastAPI sera en place, cet échange devra migrer côté serveur
          pour obtenir des jetons de rafraîchissement.
        </p>
      </div>
    </PageShell>
  )
}
