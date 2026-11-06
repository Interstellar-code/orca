import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

export function InlineError({
  message,
  onRetry
}: {
  message: string
  onRetry: () => void
}): React.JSX.Element {
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
    >
      <span className="min-w-0 break-words">{message}</span>
      <Button type="button" variant="ghost" size="xs" onClick={onRetry}>
        <RefreshCw className="size-3" />
        {translate('auto.components.task.page.dart.TaskDetail.retry', 'Retry')}
      </Button>
    </div>
  )
}

export function SkeletonLines(): React.JSX.Element {
  return (
    <div className="space-y-2" aria-hidden>
      <div className="h-3 w-4/5 animate-pulse rounded bg-muted/70" />
      <div className="h-3 w-3/5 animate-pulse rounded bg-muted/60" />
    </div>
  )
}
