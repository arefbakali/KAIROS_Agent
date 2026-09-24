import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-xs border px-2 py-0.5 text-[11px] font-medium leading-5',
  {
    variants: {
      tone: {
        neutre: 'border-line bg-surface-2 text-ink-soft',
        accent: 'border-accent/25 bg-accent-soft text-accent-ink',
        urgent: 'border-urgent/25 bg-urgent-soft text-urgent',
        ok: 'border-ok/25 bg-ok-soft text-ok',
        focus: 'border-focus/25 bg-focus-soft text-focus',
      },
    },
    defaultVariants: { tone: 'neutre' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}
