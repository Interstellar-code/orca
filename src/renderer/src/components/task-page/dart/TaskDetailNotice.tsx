import { useEffect, useState } from 'react'
import { AlertTriangle, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getIntlLocale, translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { DartNoticeApi } from './dart-detail-contracts'

function fieldLabel(field: string): string {
  switch (field) {
    case 'title':
      return translate('auto.components.task.page.dart.TaskDetailNotice.fieldTitle', 'Title')
    case 'description':
      return translate(
        'auto.components.task.page.dart.TaskDetailNotice.fieldDescription',
        'Description'
      )
    case 'dartboard':
      return translate(
        'auto.components.task.page.dart.TaskDetailNotice.fieldDartboard',
        'Dartboard'
      )
    case 'type':
      return translate('auto.components.task.page.dart.TaskDetailNotice.fieldType', 'Type')
    case 'status':
      return translate('auto.components.task.page.dart.TaskDetailNotice.fieldStatus', 'Status')
    case 'priority':
      return translate('auto.components.task.page.dart.TaskDetailNotice.fieldPriority', 'Priority')
    case 'assignee':
      return translate('auto.components.task.page.dart.TaskDetailNotice.fieldAssignee', 'Assignee')
    case 'tags':
      return translate('auto.components.task.page.dart.TaskDetailNotice.fieldTags', 'Tags')
    case 'size':
      return translate('auto.components.task.page.dart.TaskDetailNotice.fieldSize', 'Size')
    case 'startAt':
      return translate('auto.components.task.page.dart.TaskDetailNotice.fieldStartAt', 'Start date')
    case 'dueAt':
      return translate('auto.components.task.page.dart.TaskDetailNotice.fieldDueAt', 'Due date')
    default:
      return field
  }
}

function noticeText(notice: NonNullable<DartNoticeApi['notice']>): string {
  if (!notice.field) {
    return notice.message
  }
  const field = fieldLabel(notice.field)
  return notice.kind === 'refused'
    ? translate(
        'auto.components.task.page.dart.TaskDetailNotice.refusedField',
        "{{field}} wasn't saved: {{message}}",
        { field, message: notice.message }
      )
    : translate(
        'auto.components.task.page.dart.TaskDetailNotice.unknownField',
        '{{field}}: {{message}}',
        { field, message: notice.message }
      )
}

/** Extra buttons from the section that owns the failed write go in `actions`; the notice itself is never edited per task. */
export function DartTaskDetailNotice({
  notice,
  dismissNotice,
  recheckNotice,
  actions,
  className
}: DartNoticeApi & { actions?: React.ReactNode; className?: string }): React.JSX.Element | null {
  const [checking, setChecking] = useState(false)
  const [showChecking, setShowChecking] = useState(false)
  // A quick read stays clean; only a slow one gets the label swap.
  useEffect(() => {
    if (!checking) {
      setShowChecking(false)
      return
    }
    const timer = setTimeout(() => setShowChecking(true), 200)
    return () => clearTimeout(timer)
  }, [checking])
  if (!notice) {
    return null
  }
  const refused = notice.kind === 'refused'
  const tone = refused ? 'text-destructive' : 'text-muted-foreground'
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
        'flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs',
        refused ? 'border-destructive/30 bg-destructive/10' : 'border-border/50 bg-muted/35',
        className
      )}
    >
      <Icon className={cn('mt-0.5 size-3.5 flex-none', tone)} />
      <div className={cn('min-w-0 flex-1', tone)}>
        <p className="break-words">{noticeText(notice)}</p>
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
          <span className="grid">
            <span
              aria-hidden={showChecking}
              className={cn('col-start-1 row-start-1', showChecking && 'invisible')}
            >
              {translate(
                'auto.components.task.page.dart.TaskDetailNotice.checkAgain',
                'Check again'
              )}
            </span>
            {showChecking ? (
              <span className="col-start-1 row-start-1">
                {translate('auto.components.task.page.dart.TaskDetailNotice.checking', 'Checking…')}
              </span>
            ) : null}
          </span>
        </Button>
      ) : null}
      {actions}
      <Button type="button" variant="ghost" size="xs" onClick={dismissNotice}>
        {translate('auto.components.task.page.dart.TaskDetailNotice.dismiss', 'Dismiss')}
      </Button>
    </div>
  )
}
