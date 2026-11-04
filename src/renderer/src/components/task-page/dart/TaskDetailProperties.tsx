import type { DartDetailEditApi } from './dart-detail-contracts'
import { translate, getIntlLocale } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { getDartStatusTone } from './task-page-dart-list-model'

function formatDueDate(value: string | null | undefined): string | null {
  const time = value ? Date.parse(value) : Number.NaN
  return Number.isNaN(time) ? null : new Date(time).toLocaleDateString(getIntlLocale())
}

function MetadataItem({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-2xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-xs text-foreground">{children}</dd>
    </div>
  )
}

// T4b's editors read the rest of the contract; every field is named here so a rename fails the typecheck.
export function DartTaskDetailProperties({
  task,
  openUrl: _openUrl,
  onUpdate: _onUpdate,
  pendingFields,
  blockedFields,
  config: _config,
  supportsWritesV2: _supportsWritesV2,
  viewerName: _viewerName
}: DartDetailEditApi): React.JSX.Element {
  const due = formatDueDate(task.dueAt)
  return (
    <>
      <dl
        aria-busy={pendingFields.size > 0 || blockedFields.size > 0}
        className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-border/60 px-4 py-3 sm:grid-cols-4"
      >
        <MetadataItem
          label={translate('auto.components.task.page.dart.TaskDetail.status', 'Status')}
        >
          {task.status ? (
            <span
              className={cn(
                'inline-flex max-w-full items-center rounded-full border px-1.5 py-0.5 text-2xs font-medium',
                getDartStatusTone(task.status)
              )}
            >
              <span className="truncate">{task.status}</span>
            </span>
          ) : (
            '—'
          )}
        </MetadataItem>
        <MetadataItem
          label={translate('auto.components.task.page.dart.TaskDetail.priority', 'Priority')}
        >
          {task.priority ?? '—'}
        </MetadataItem>
        <MetadataItem
          label={translate('auto.components.task.page.dart.TaskDetail.assignee', 'Assignee')}
        >
          {task.assignee ??
            translate('auto.components.task.page.dart.TaskDetail.unassigned', 'Unassigned')}
        </MetadataItem>
        <MetadataItem label={translate('auto.components.task.page.dart.TaskDetail.due', 'Due')}>
          {due ?? '—'}
        </MetadataItem>
      </dl>

      {task.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1 border-b border-border/60 px-4 py-2.5">
          {task.tags.map((tag) => (
            <span
              key={tag}
              className="max-w-40 truncate rounded-full border border-border/50 bg-muted/35 px-1.5 py-0.5 text-2xs text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </>
  )
}
