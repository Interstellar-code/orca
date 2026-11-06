import type { DartDetailEditApi } from './dart-detail-contracts'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { DartDateField } from './DartDateField'
import { DartSearchChip, DartSelectChip, dartFieldState } from './DartPropertyChips'
import { DartTagsPicker } from './DartTagsPicker'
import { getDartStatusTone } from './task-page-dart-list-model'

function MetadataItem({
  label,
  className,
  children
}: {
  label: string
  className?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <dt className="text-2xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-xs text-foreground">{children}</dd>
    </div>
  )
}

const NO_OPTIONS: readonly string[] = []

export function DartTaskDetailProperties({
  task,
  openUrl: _openUrl,
  onUpdate,
  pendingFields,
  blockedFields,
  config,
  configFailed,
  supportsWritesV2,
  viewerName
}: DartDetailEditApi): React.JSX.Element {
  const state = (field: string) => dartFieldState(field, pendingFields, blockedFields)
  const noConfig = config === null
  const set = (
    updates: Parameters<typeof onUpdate>[0],
    optimistic: Parameters<typeof onUpdate>[1]
  ) => void onUpdate(updates, optimistic)
  const size = task.size === null || task.size === undefined ? null : String(task.size)
  const canAssignToMe =
    viewerName !== null &&
    config?.assignees.includes(viewerName) === true &&
    task.assignee !== viewerName
  return (
    <>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-border/60 px-4 py-3 sm:grid-cols-4">
        <MetadataItem
          label={translate('auto.components.task.page.dart.TaskDetail.status', 'Status')}
        >
          <DartSelectChip
            label={translate('auto.components.task.page.dart.TaskDetail.status', 'Status')}
            value={task.status ?? null}
            options={config?.statuses ?? NO_OPTIONS}
            state={state('status')}
            disabled={noConfig}
            toneClass={
              task.status
                ? cn('rounded-full border px-1.5 py-0.5', getDartStatusTone(task.status))
                : undefined
            }
            onChange={(status) => status && set({ status }, { status })}
          />
        </MetadataItem>
        <MetadataItem
          label={translate('auto.components.task.page.dart.TaskDetail.priority', 'Priority')}
        >
          <DartSelectChip
            label={translate('auto.components.task.page.dart.TaskDetail.priority', 'Priority')}
            value={task.priority ?? null}
            options={config?.priorities ?? NO_OPTIONS}
            noneLabel={translate('auto.components.task.page.dart.TaskDetail.none', 'None')}
            state={state('priority')}
            disabled={noConfig}
            onChange={(priority) => set({ priority }, { priority })}
          />
        </MetadataItem>
        <MetadataItem
          label={translate('auto.components.task.page.dart.TaskDetail.assignee', 'Assignee')}
        >
          <DartSearchChip
            label={translate('auto.components.task.page.dart.TaskDetail.assignee', 'Assignee')}
            valueLabel={
              task.assignee ??
              translate('auto.components.task.page.dart.TaskDetail.unassigned', 'Unassigned')
            }
            options={config?.assignees ?? NO_OPTIONS}
            selected={task.assignee ?? null}
            clearLabel={translate(
              'auto.components.task.page.dart.TaskDetail.unassigned',
              'Unassigned'
            )}
            extras={
              canAssignToMe
                ? [
                    {
                      key: 'me',
                      label: translate(
                        'auto.components.task.page.dart.TaskDetail.assignToMe',
                        'Assign to me'
                      ),
                      onSelect: () => set({ assignee: viewerName }, { assignee: viewerName })
                    }
                  ]
                : undefined
            }
            state={state('assignee')}
            disabled={noConfig}
            searchPlaceholder={translate(
              'auto.components.task.page.dart.TaskDetail.searchAssignees',
              'Search people'
            )}
            emptyLabel={translate(
              'auto.components.task.page.dart.TaskDetail.noPeople',
              'No people found.'
            )}
            onPick={(assignee) => set({ assignee }, { assignee })}
          />
        </MetadataItem>
        <MetadataItem label={translate('auto.components.task.page.dart.TaskDetail.size', 'Size')}>
          {supportsWritesV2 ? (
            <DartSelectChip
              label={translate('auto.components.task.page.dart.TaskDetail.size', 'Size')}
              value={size}
              options={config?.sizes ?? NO_OPTIONS}
              noneLabel={translate('auto.components.task.page.dart.TaskDetail.none', 'None')}
              state={state('size')}
              disabled={noConfig}
              onChange={(next) => set({ size: next }, { size: next })}
            />
          ) : (
            <span>{size ?? '—'}</span>
          )}
        </MetadataItem>
        <MetadataItem label={translate('auto.components.task.page.dart.TaskDetail.start', 'Start')}>
          <DartDateField
            key={task.id}
            label={translate('auto.components.task.page.dart.TaskDetail.start', 'Start')}
            value={task.startAt}
            editable={supportsWritesV2}
            state={state('startAt')}
            onChange={(startAt) => set({ startAt }, { startAt })}
          />
        </MetadataItem>
        <MetadataItem label={translate('auto.components.task.page.dart.TaskDetail.due', 'Due')}>
          <DartDateField
            key={task.id}
            label={translate('auto.components.task.page.dart.TaskDetail.due', 'Due')}
            value={task.dueAt}
            editable={supportsWritesV2}
            state={state('dueAt')}
            onChange={(dueAt) => set({ dueAt }, { dueAt })}
          />
        </MetadataItem>
        <MetadataItem
          label={translate('auto.components.task.page.dart.TaskDetail.dartboard', 'Dartboard')}
          className="col-span-2"
        >
          <DartSearchChip
            label={translate('auto.components.task.page.dart.TaskDetail.dartboard', 'Dartboard')}
            valueLabel={task.dartboard || '—'}
            options={config?.dartboards ?? NO_OPTIONS}
            selected={task.dartboard || null}
            state={state('dartboard')}
            disabled={noConfig}
            searchPlaceholder={translate(
              'auto.components.task.page.dart.TaskDetail.searchDartboards',
              'Search dartboards'
            )}
            emptyLabel={translate(
              'auto.components.task.page.dart.TaskDetail.noDartboards',
              'No dartboards found.'
            )}
            onPick={(dartboard) => dartboard && set({ dartboard }, { dartboard })}
          />
        </MetadataItem>
      </dl>

      <div className="border-b border-border/60 px-4 py-2.5">
        <DartTagsPicker
          tags={task.tags}
          options={config?.tags ?? NO_OPTIONS}
          state={state('tags')}
          disabled={noConfig}
          onChange={(tags) => set({ tags }, { tags })}
        />
        {noConfig && configFailed ? (
          <p className="pt-2 text-2xs text-muted-foreground">
            {translate(
              'auto.components.task.page.dart.TaskDetail.noConfig',
              'Field options are not available from Dart right now, so these fields cannot be edited.'
            )}
          </p>
        ) : null}
      </div>
    </>
  )
}
