import { cn } from '@/lib/utils'

/** Barre de contribution utilisée par « Pourquoi ce choix ? ». */
export function Meter({
  value,
  label,
  detail,
  tone = 'accent',
}: {
  value: number
  label: string
  detail?: string
  tone?: 'accent' | 'focus' | 'urgent'
}) {
  const percent = Math.round(Math.min(Math.max(value, 0), 1) * 100)
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium text-ink-2">{label}</span>
        <span className="font-numeric text-[11px] text-ink-faint">{percent} %</span>
      </div>
      <div
        className="h-1 w-full overflow-hidden rounded-full bg-surface-2"
        role="meter"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-500',
            tone === 'accent' && 'bg-accent',
            tone === 'focus' && 'bg-focus',
            tone === 'urgent' && 'bg-urgent',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      {detail ? <p className="text-xs text-ink-faint">{detail}</p> : null}
    </div>
  )
}
