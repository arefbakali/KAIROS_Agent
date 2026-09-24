import { useState } from 'react'
import { ChevronDown, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

const steps: Array<{ title: string; detail: string; link?: { label: string; href: string } }> = [
  {
    title: 'Créer un projet Google Cloud',
    detail:
      'Un projet gratuit suffit. Les quotas des API Calendar et Gmail sont largement au-dessus des besoins d\u2019une démonstration.',
    link: { label: 'console.cloud.google.com', href: 'https://console.cloud.google.com/projectcreate' },
  },
  {
    title: 'Activer les deux API',
    detail: 'Dans « API et services », activer Google Calendar API puis Gmail API.',
    link: {
      label: 'Bibliothèque d\u2019API',
      href: 'https://console.cloud.google.com/apis/library',
    },
  },
  {
    title: 'Configurer l\u2019écran de consentement',
    detail:
      'Type « Externe », état « Test ». Ajoutez votre adresse Gmail comme utilisateur de test : les portées sensibles fonctionnent alors sans validation ni frais, pour cent comptes maximum.',
    link: {
      label: 'Écran de consentement',
      href: 'https://console.cloud.google.com/apis/credentials/consent',
    },
  },
  {
    title: 'Créer un ID client OAuth',
    detail:
      'Type « Application Web ». Dans « Origines JavaScript autorisées », ajoutez exactement http://localhost:5173. Aucun secret client n\u2019est nécessaire ici, et il ne faut jamais en placer dans un front-end.',
    link: { label: 'Identifiants', href: 'https://console.cloud.google.com/apis/credentials' },
  },
  {
    title: 'Renseigner la variable d\u2019environnement',
    detail:
      'Copier l\u2019ID client dans le fichier .env sous la clé VITE_GOOGLE_CLIENT_ID, puis relancer npm run dev.',
  },
]

export function GoogleSetupGuide({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="rounded-lg border border-line bg-surface">
      <button
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-medium text-ink">
            Activer la connexion Google réelle en cinq étapes
          </span>
          <span className="mt-0.5 block text-[13px] text-ink-soft">
            Entièrement gratuit. Environ dix minutes, une seule fois.
          </span>
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-ink-faint transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open && (
        <ol className="space-y-4 border-t border-line px-5 py-5">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-3.5">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line bg-surface-2 font-numeric text-[11px] text-ink-soft">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="text-[13.5px] font-medium text-ink">{step.title}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-soft">{step.detail}</p>
                {step.link && (
                  <a
                    href={step.link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-[12.5px] text-accent-ink underline-offset-4 hover:underline"
                  >
                    {step.link.label}
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                )}
              </div>
            </li>
          ))}

          <li className="rounded-md border border-line bg-surface-2 p-3.5">
            <p className="eyebrow mb-1.5">Fichier .env</p>
            <pre className="overflow-x-auto font-numeric text-[12px] leading-relaxed text-ink-2">
              {'VITE_GOOGLE_CLIENT_ID=123456789-abcdefg.apps.googleusercontent.com'}
            </pre>
          </li>
        </ol>
      )}
    </div>
  )
}
