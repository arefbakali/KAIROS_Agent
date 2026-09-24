import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '@/lib/utils'

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-line-strong transition-colors',
      'data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=unchecked]:bg-surface-2',
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block h-3.5 w-3.5 translate-x-0.5 rounded-full bg-surface shadow-hair transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-white" />
  </SwitchPrimitive.Root>
))
Switch.displayName = 'Switch'
