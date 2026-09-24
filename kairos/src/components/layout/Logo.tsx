import { cn } from '@/lib/utils'

/**
 * Kairos, en grec, désigne le moment opportun — par opposition à Chronos, le
 * temps qui s'écoule. La marque reprend cette idée : un cercle ouvert, celui
 * du temps qui passe, et un point plein qui marque l'instant à saisir.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={cn('h-7 w-7', className)} aria-hidden focusable="false">
      <defs>
        <linearGradient id="kairos-mark" x1="0" y1="28" x2="28" y2="0">
          <stop offset="0%" stopColor="var(--color-accent-2)" />
          <stop offset="100%" stopColor="var(--color-accent)" />
        </linearGradient>
      </defs>
      <path
        d="M14 3.2a10.8 10.8 0 1 0 10.35 7.75"
        fill="none"
        stroke="url(#kairos-mark)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path d="M14 14 L14 8.4" fill="none" stroke="url(#kairos-mark)" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="22.6" cy="6.1" r="3.05" fill="url(#kairos-mark)" />
    </svg>
  )
}

export function Logo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark className="h-6 w-6" />
      {!collapsed && (
        <span className="font-display text-[17px] font-bold uppercase leading-none tracking-[0.07em] text-ink">
          Kairos
        </span>
      )}
    </div>
  )
}
