import { useState } from 'react'
import { toast } from 'sonner'
import { Mail, Monitor, Moon, Sun, CheckCircle } from 'lucide-react'
import { PageHeader, PageShell } from '@/components/layout/PageHeader'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/field'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { Badge } from '@/components/ui/badge'
import { useWorkspaceStore, type ThemeMode } from '@/store/useWorkspaceStore'
import { useCurrentUser } from '@/store/useSessionStore'
import {
  useReminderStatus,
  useConnectReminders,
  useSyncReminders,
  useSetWeeklySummaryPrefs,
} from '@/hooks/useWorkspaceData'
import type { WeekDay } from '@/services/reminder.api'

const themeIcon: Record<ThemeMode, typeof Sun> = { clair: Sun, sombre: Moon, systeme: Monitor }

const JOURS_SEMAINE: { value: WeekDay; label: string }[] = [
  { value: 'monday', label: 'Lundi' },
  { value: 'tuesday', label: 'Mardi' },
  { value: 'wednesday', label: 'Mercredi' },
  { value: 'thursday', label: 'Jeudi' },
  { value: 'friday', label: 'Vendredi' },
  { value: 'saturday', label: 'Samedi' },
  { value: 'sunday', label: 'Dimanche' },
]

export function SettingsPage() {
  const theme = useWorkspaceStore((state) => state.theme)
  const setTheme = useWorkspaceStore((state) => state.setTheme)
  const [preferences, setPreferences] = useState({
    workStart: '08:30',
    workEnd: '19:00',
    focusBlockMinutes: 90,
    lunchStart: '12:30',
    lunchEnd: '13:30',
    autoAcceptLowRisk: false,
    voiceEnabled: true,
    reducedDensity: false,
    emailReminders: false,
  })
  const user = useCurrentUser()
  const ThemeIcon = themeIcon[theme]

  const { data: reminderStatus } = useReminderStatus()
  const connectReminders = useConnectReminders()
  const syncReminders = useSyncReminders()
  const setWeeklySummaryPrefs = useSetWeeklySummaryPrefs()

  const remindersConnected = reminderStatus?.connected ?? false
  const reminderEmail = reminderStatus?.email ?? ''
  const weeklySummaryEnabled = reminderStatus?.weeklySummaryEnabled ?? false
  const weeklySummaryDay = reminderStatus?.weeklySummaryDay ?? 'monday'

  return (
    <PageShell className="max-w-[820px]">
      <PageHeader
        eyebrow="Paramètres"
        title="Les règles que KAIROS doit respecter"
        description="L'agent ne propose jamais un créneau en dehors de ce cadre."
      />

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Apparence</CardTitle>
            <ThemeIcon className="h-4 w-4 text-ink-faint" aria-hidden />
          </CardHeader>
          <CardBody className="space-y-4">
            <Segmented
              ariaLabel="Thème de l'interface"
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'clair', label: 'Clair' },
                { value: 'sombre', label: 'Sombre' },
                { value: 'systeme', label: 'Système' },
              ]}
            />
            <label className="flex items-center justify-between gap-3">
              <span>
                <span className="block text-[13.5px] font-medium text-ink">Densité réduite</span>
                <span className="block text-[12.5px] text-ink-soft">Plus d&apos;air entre les blocs du planning.</span>
              </span>
              <Switch
                checked={preferences.reducedDensity}
                onCheckedChange={(checked) => setPreferences({ ...preferences, reducedDensity: checked })}
              />
            </label>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Horaires de travail</CardTitle>
          </CardHeader>
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Début de journée" htmlFor="work-start">
              <Input
                id="work-start"
                type="time"
                value={preferences.workStart}
                onChange={(event) => setPreferences({ ...preferences, workStart: event.target.value })}
              />
            </Field>
            <Field label="Fin de journée" htmlFor="work-end">
              <Input
                id="work-end"
                type="time"
                value={preferences.workEnd}
                onChange={(event) => setPreferences({ ...preferences, workEnd: event.target.value })}
              />
            </Field>
            <Field label="Début du déjeuner" htmlFor="lunch-start">
              <Input
                id="lunch-start"
                type="time"
                value={preferences.lunchStart}
                onChange={(event) => setPreferences({ ...preferences, lunchStart: event.target.value })}
              />
            </Field>
            <Field label="Fin du déjeuner" htmlFor="lunch-end">
              <Input
                id="lunch-end"
                type="time"
                value={preferences.lunchEnd}
                onChange={(event) => setPreferences({ ...preferences, lunchEnd: event.target.value })}
              />
            </Field>
            <Field
              label="Durée d'un bloc de concentration (minutes)"
              htmlFor="focus-block"
              hint="KAIROS évitera de couper une tâche en dessous de cette durée."
            >
              <Input
                id="focus-block"
                type="number"
                min={15}
                step={15}
                value={preferences.focusBlockMinutes}
                onChange={(event) =>
                  setPreferences({ ...preferences, focusBlockMinutes: Number(event.target.value) })
                }
              />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Comportement de l&apos;agent</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <label className="flex items-center justify-between gap-3">
              <span>
                <span className="block text-[13.5px] font-medium text-ink">
                  Appliquer seul les changements sans risque
                </span>
                <span className="block text-[12.5px] text-ink-soft">
                  Déplacement d&apos;un bloc de concentration à l&apos;intérieur de la même journée, sans conflit.
                </span>
              </span>
              <Switch
                checked={preferences.autoAcceptLowRisk}
                onCheckedChange={(checked) => setPreferences({ ...preferences, autoAcceptLowRisk: checked })}
              />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span>
                <span className="block text-[13.5px] font-medium text-ink">Commande vocale</span>
                <span className="block text-[12.5px] text-ink-soft">
                  Utilise la reconnaissance vocale du navigateur, quand elle est disponible.
                </span>
              </span>
              <Switch
                checked={preferences.voiceEnabled}
                onCheckedChange={(checked) => setPreferences({ ...preferences, voiceEnabled: checked })}
              />
            </label>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rappels e-mail</CardTitle>
            <Mail className="h-4 w-4 text-ink-faint" aria-hidden />
          </CardHeader>
          <CardBody className="space-y-4">
            <p className="text-[13px] text-ink-2">
              Recevez un e-mail de rappel 1 jour, 1 heure et 30 minutes avant chaque événement.
              Les rappels sont envoyés même si le navigateur est fermé.
            </p>

            {remindersConnected ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[13px] text-ink">
                  <CheckCircle className="h-4 w-4 text-ok" aria-hidden />
                  <span>Connecté à <strong>{reminderEmail}</strong></span>
                  <Badge tone="ok">Actif</Badge>
                </div>

                <label className="flex items-center justify-between gap-3">
                  <span>
                    <span className="block text-[13.5px] font-medium text-ink">
                      Activer les rappels
                    </span>
                    <span className="block text-[12.5px] text-ink-soft">
                      Synchroniser tous les événements à venir avec le scheduler.
                    </span>
                  </span>
                  <Switch
                    checked={preferences.emailReminders}
                    onCheckedChange={(checked) => {
                      setPreferences({ ...preferences, emailReminders: checked })
                      syncReminders.mutate(checked)
                    }}
                  />
                </label>

                <div className="border-t border-line pt-3">
                  <label className="flex items-center justify-between gap-3">
                    <span>
                      <span className="block text-[13.5px] font-medium text-ink">
                        Résumé hebdomadaire
                      </span>
                      <span className="block text-[12.5px] text-ink-soft">
                        Un e-mail récapitulant les événements des 7 prochains jours, envoyé chaque
                        semaine le jour de votre choix.
                      </span>
                    </span>
                    <Switch
                      checked={weeklySummaryEnabled}
                      onCheckedChange={(checked) =>
                        setWeeklySummaryPrefs.mutate({ enabled: checked, day: weeklySummaryDay })
                      }
                    />
                  </label>

                  {weeklySummaryEnabled && (
                    <div className="mt-3 max-w-xs">
                      <Field label="Jour d'envoi" htmlFor="weekly-summary-day">
                        <Select
                          id="weekly-summary-day"
                          value={weeklySummaryDay}
                          onChange={(event) =>
                            setWeeklySummaryPrefs.mutate({
                              enabled: true,
                              day: event.target.value as WeekDay,
                            })
                          }
                        >
                          {JOURS_SEMAINE.map((jour) => (
                            <option key={jour.value} value={jour.value}>
                              {jour.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[12.5px] text-ink-faint">
                  Pas encore connecté. Autorisez l&apos;envoi de courriels depuis votre compte Google.
                </p>
                <Button
                  variant="accent"
                  size="sm"
                  loading={connectReminders.isPending}
                  onClick={() => connectReminders.mutate()}
                >
                  <Mail className="h-3.5 w-3.5" aria-hidden />
                  Connecter Gmail pour les rappels
                </Button>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Compte</CardTitle>
          </CardHeader>
          <CardBody className="space-y-1 text-[13.5px] text-ink-2">
            <p>
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-ink-soft">{user?.email}</p>
            <p className="font-numeric text-[12px] text-ink-faint">
              Fuseau horaire : {user?.timezone}
            </p>
            <p className="pt-1 text-[12.5px] text-ink-faint">
              Session ouverte avec votre compte Google.
            </p>
          </CardBody>
        </Card>

        <div className="flex justify-end">
          <Button variant="accent" onClick={() => toast.success('Préférences enregistrées')}>
            Enregistrer les préférences
          </Button>
        </div>
      </div>
    </PageShell>
  )
}
