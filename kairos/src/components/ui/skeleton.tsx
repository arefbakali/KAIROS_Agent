import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-sm bg-surface-2', className)} aria-hidden />
}

export function SkeletonPage() {
  return (
    <div className="space-y-4" role="status" aria-label="Chargement en cours">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-52 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  )
}
