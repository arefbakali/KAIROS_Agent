import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background-color,color,border-color,box-shadow,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        primary: 'bg-ink text-paper hover:bg-ink-2 shadow-hair',
        accent: 'bg-brand text-white ring-brand hover:brightness-110',
        outline: 'border border-line-strong bg-surface text-ink hover:bg-surface-2',
        ghost: 'text-ink-soft hover:bg-surface-2 hover:text-ink',
        quiet: 'text-ink-soft hover:text-ink underline-offset-4 hover:underline',
        danger: 'border border-urgent/30 bg-urgent-soft text-urgent hover:bg-urgent hover:text-white',
      },
      size: {
        sm: 'h-8 rounded-sm px-3 text-[13px]',
        md: 'h-9 rounded-sm px-4 text-sm',
        lg: 'h-11 rounded-md px-5 text-[15px]',
        icon: 'h-9 w-9 rounded-sm',
        'icon-sm': 'h-7 w-7 rounded-xs',
      },
    },
    defaultVariants: { variant: 'outline', size: 'md' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            <span>Un instant…</span>
          </>
        ) : (
          children
        )}
      </Comp>
    )
  },
)
Button.displayName = 'Button'
export { buttonVariants }
