import { AlertCircle, CheckCircle2, LoaderCircle, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslate } from '@/i18n/use-translate'

type DartViewer = { name: string; email?: string | null }

type Props = {
  viewer: DartViewer
  testResult: { state: 'ok' | 'error'; error?: string } | null
  testing: boolean
  onTest: () => void
  onDisconnect: () => void
  className: string
}

export function DartConnectedAccountRow({
  viewer,
  testResult,
  testing,
  onTest,
  onDisconnect,
  className
}: Props): React.JSX.Element {
  const t = useTranslate()
  return (
    <div className={className}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {viewer.email ? `${viewer.name} (${viewer.email})` : viewer.name}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {t(
            'auto.components.settings.dart.integration.card.connectedAs',
            'Connected with an authorization token'
          )}
        </p>
      </div>
      {testResult?.state === 'ok' ? (
        <span className="flex shrink-0 items-center gap-1 text-xs text-status-success">
          <CheckCircle2 className="size-3.5" />
          {t('auto.components.settings.task.tracker.integration.cards.a2c0015fb8', 'Verified')}
        </span>
      ) : null}
      {testResult?.state === 'error' ? (
        <span className="flex min-w-0 max-w-[220px] shrink items-center gap-1 truncate text-xs text-destructive">
          <AlertCircle className="size-3.5 shrink-0" />
          <span className="truncate">{testResult.error}</span>
        </span>
      ) : null}
      <Button variant="outline" size="sm" onClick={onTest} disabled={testing}>
        {testing ? (
          <>
            <LoaderCircle className="size-3.5 mr-1.5 animate-spin" />
            {t('auto.components.settings.task.tracker.integration.cards.3e7c10d286', 'Testing...')}
          </>
        ) : (
          t('auto.components.settings.task.tracker.integration.cards.c24e56c532', 'Test')
        )}
      </Button>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onDisconnect}
            aria-label={t(
              'auto.components.settings.dart.integration.card.disconnect',
              'Disconnect Dart'
            )}
            className="rounded-md p-1 text-muted-foreground/50 transition-colors hover:text-destructive"
          >
            <Unlink className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {t('auto.components.settings.dart.integration.card.disconnect', 'Disconnect Dart')}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
