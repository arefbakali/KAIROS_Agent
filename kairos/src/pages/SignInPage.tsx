import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertTriangle, CalendarCheck, Mail, ShieldCheck, Sparkles } from 'lucide-react'
import { LogoMark } from '@/components/layout/Logo'
import { GoogleSetupGuide } from '@/components/integrations/GoogleSetupGuide'
import { authApi } from '@/services/google/auth.api'
import { GoogleAuthError, googleConfigured } from '@/services/google/gis'
import { useSessionStore } from '@/store/useSessionStore'
import { useTheme } from '@/hooks/useTheme'
import { cn } from '@/lib/utils'

/** Marque Google officielle, requise par les règles d'usage. */
function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden focusable="false">
      <path fill="#4285F4" d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.87c2.27-2.09 3.56-5.17 3.56-8.87Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.87-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.28v3.09A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.28a12 12 0 0 0 0 10.76l3.99-3.09Z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43C17.95 1.18 15.24 0 12 0A12 12 0 0 0 1.28 6.62l3.99 3.09C6.22 6.86 8.87 4.75 12 4.75Z" />
    </svg>
  )
}

const capabilities = [
  {
    icon: CalendarCheck,
    title: 'Il lit votre agenda réel',
    detail: 'Vos événements Google, analysés dès la connexion. Chevauchements et trajets trop courts détectés.',
  },
  {
    icon: Sparkles,
    title: 'Il propose, puis explique',
    detail: 'Chaque décision affiche ses critères. Rien n\u2019est écrit dans votre calendrier sans votre accord.',
  },
  {
    icon: Mail,
    title: 'Il surveille vos invitations',
    detail: 'Les engagements reçus par courriel remontent avant de vous échapper.',
  },
]

export function SignInPage() {
  useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const signIn = useSessionStore((state) => state.signIn)

  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/aujourdhui'

  async function handleGoogle() {
    setPending(true)
    setError(null)
    try {
      const result = await authApi.signIn()
      signIn(result)
      navigate(redirectTo, { replace: true })
    } catch (caught) {
      setError(
        caught instanceof GoogleAuthError
          ? caught.message
          : 'La connexion a échoué. Vérifiez votre connexion réseau et réessayez.',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="grid min-h-dvh bg-paper lg:grid-cols-[1.08fr_1fr]">
      {/* Panneau de marque : seul endroit avec le dégradé en fond */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-ink p-12 lg:flex">
        <div
          className="pointer-events-none absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-brand opacity-30 blur-[110px]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-40 -right-24 h-[380px] w-[380px] rounded-full bg-brand opacity-20 blur-[120px]"
          aria-hidden
        />

        <div className="relative flex items-center gap-2.5">
          <LogoMark className="h-7 w-7" />
          <span className="font-display text-[18px] font-bold uppercase tracking-[0.08em] text-white">
            Kairos
          </span>
        </div>

        <div className="relative max-w-lg">
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-4 font-mono text-[11px] uppercase tracking-[0.22em] text-white/45"
          >
            Own your time.
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut', delay: 0.05 }}
            className="font-display text-[40px] font-semibold leading-[1.08] tracking-[-0.03em] text-white"
          >
            Votre calendrier
            <br />
            arrête de subir.
          </motion.h1>

          <ul className="mt-10 space-y-6">
            {capabilities.map((item, index) => {
              const Icon = item.icon
              return (
                <motion.li
                  key={item.title}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.14 + index * 0.09 }}
                  className="flex gap-4"
                >
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-sm border border-white/12 bg-white/6 text-white">
                    <Icon className="h-[15px] w-[15px]" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14.5px] font-medium text-white">{item.title}</span>
                    <span className="mt-1 block text-[13.5px] leading-relaxed text-white/55">
                      {item.detail}
                    </span>
                  </span>
                </motion.li>
              )
            })}
          </ul>
        </div>

        <p className="relative max-w-md text-[12px] leading-relaxed text-white/35">
          Projet universitaire — agent d&apos;organisation personnelle intégré à Google Calendar.
          Back-end FastAPI, LangGraph et Ollama.
        </p>
      </section>

      {/* Panneau de connexion */}
      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-[380px]">
          <div className="mb-10 flex items-center gap-2.5 lg:hidden">
            <LogoMark className="h-7 w-7" />
            <span className="font-display text-[18px] font-bold uppercase tracking-[0.08em] text-ink">
              Kairos
            </span>
          </div>

          <p className="eyebrow mb-3">Connexion</p>
          <h2 className="font-display text-[27px] font-semibold leading-[1.15] tracking-[-0.025em] text-ink">
            Reprenez la main
            <br />
            sur votre semaine
          </h2>
          <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">
            KAIROS travaille directement sur le compte Google que vous ouvrez ici. Aucune donnée
            fictive, aucun compte à créer.
          </p>

          {error && (
            <p
              role="alert"
              className="mt-6 flex items-start gap-2 rounded-md border border-urgent/25 bg-urgent-soft px-3.5 py-3 text-[13px] leading-relaxed text-urgent"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {error}
            </p>
          )}

          <button
            onClick={() => void handleGoogle()}
            disabled={!googleConfigured || pending}
            className={cn(
              'mt-8 flex h-12 w-full items-center justify-center gap-3 rounded-md bg-brand text-[14.5px] font-medium text-white',
              'ring-brand transition-transform duration-150 hover:-translate-y-px active:translate-y-0',
              'disabled:pointer-events-none disabled:opacity-45',
            )}
          >
            <span className="grid h-6 w-6 place-items-center rounded-full bg-white">
              <GoogleGlyph />
            </span>
            {pending ? 'Ouverture de Google…' : 'Continuer avec Google'}
          </button>

          {!googleConfigured && (
            <p className="mt-4 rounded-md border border-line bg-surface-2 px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-soft">
              Aucun identifiant client Google n&apos;est configuré. Renseignez
              <code className="mx-1 font-numeric text-[11.5px]">VITE_GOOGLE_CLIENT_ID</code>
              dans le fichier <code className="font-numeric text-[11.5px]">.env</code>, puis relancez
              le serveur.
            </p>
          )}

          <div className="mt-8 space-y-3 border-t border-line pt-6">
            <p className="eyebrow">Ce que KAIROS demande</p>
            <ul className="space-y-2">
              {[
                'Votre nom et votre adresse, pour personnaliser l\u2019espace',
                'Votre calendrier, en lecture et en écriture',
                'Votre messagerie, pour repérer et envoyer les rappels',
              ].map((line) => (
                <li key={line} className="flex gap-2.5 text-[13px] leading-relaxed text-ink-soft">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
            <p className="flex items-start gap-2 pt-1 text-[12px] leading-relaxed text-ink-faint">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Le jeton reste dans votre navigateur, pour la durée de l&apos;onglet. Se déconnecter le
              révoque immédiatement chez Google.
            </p>
          </div>

          {!googleConfigured && (
            <div className="mt-6">
              <GoogleSetupGuide />
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
