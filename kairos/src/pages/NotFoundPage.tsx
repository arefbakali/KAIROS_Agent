import { Link } from 'react-router-dom'
import { PageShell } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <PageShell className="max-w-[560px]">
      <p className="eyebrow mb-3">Page introuvable</p>
      <h1 className="font-display text-[26px] font-semibold text-ink">Cette adresse ne mène nulle part</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
        Le lien a peut-être changé. Revenez à votre journée pour retrouver vos points d&apos;attention.
      </p>
      <Button variant="accent" className="mt-5" asChild>
        <Link to="/aujourdhui">Retour à Aujourd&apos;hui</Link>
      </Button>
    </PageShell>
  )
}
