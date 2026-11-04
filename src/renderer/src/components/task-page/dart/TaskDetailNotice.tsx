import { useState } from 'react'
import { AlertTriangle, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getIntlLocale, translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { DartNoticeApi } from './dart-detail-contracts'

export function DartTaskDetailNotice({
  notice,
  dismissNotice,
  recheckNotice
}: DartNoticeApi): React.JSX.Element | null {
  const [checking, setChecking] = useState(false)
  if (!notice) {
    return null
  }
  const refused = notice.kind === 'refused'
  const Icon = refused ? AlertTriangle : Info
  const recheck = async (): Promise<void> => {
    setChecking(true)
    try {
      await recheckNotice()
    } finally {
      setChecking(false)
    }
  }
  return (
    <div
      role={refused ? 'alert' : 'status'}
      className={cn(
        'mx-4 mt-3 flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs',
        refused
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : 'border-border/50 bg-muted/35 text-muted-foreground'
      )}
    >
      <Icon className="mt-0.5 size-3.5 flex-none" />
      <div className="min-w-0 flex-1">
        <p className="break-words">{notice.message}</p>
        {notice.kind === 'unknown' && notice.checkedAt !== undefined ? (
          <p className="mt-0.5 text-2xs">
            {translate(
              'auto.components.task.page.dart.TaskDetailNotice.checkedAt',
              'Last checked {{time}}',
              { time: new Date(notice.checkedAt).toLocaleTimeString(getIntlLocale()) }
            )}
          </p>
        ) : null}
      </div>
      {notice.kind === 'unknown' ? (
        <Button type="button" variant="outline" size="xs" disabled={checking} onClick={recheck}>
          {translate('auto.components.task.page.dart.TaskDetailNotice.checkAgain', 'Check again')}
        </Button>
      ) : null}
      <Button type="button" variant="ghost" size="xs" onClick={dismissNotice}>
        {translate('auto.components.task.page.dart.TaskDetailNotice.dismiss', 'Dismiss')}
      </Button>
    </div>
  )
}
