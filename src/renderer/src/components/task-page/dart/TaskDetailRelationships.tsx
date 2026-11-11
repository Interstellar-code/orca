import { Ban, CornerLeftUp, X } from 'lucide-react'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { isDartTaskFinished, isDartTaskOnHold } from './dart-board-columns'
import type { DartLoad, DartRelationshipsApi } from './dart-board-contracts'
import { DartBlockerPicker } from './DartBlockerPicker'
import { DartRelatedTaskButton } from './DartRelatedTaskButton'
import { InlineError, SkeletonLines } from './TaskDetailLoadStates'
import { DartTaskDetailNotice } from './TaskDetailNotice'
import { SectionHeading } from './TaskDetailSectionHeading'

const SECTION_CLASS = 'space-y-2 border-t border-border/60 px-4 py-4'

/** False when Dart returned no links for the task; the view then mounts neither section's content. */
export function dartRelationshipsKnown(relationships: DartRelationshipsApi): boolean {
  return relationships.state !== 'notChecked'
}

export type TaskDetailRelationshipsProps = {
  relationships: DartRelationshipsApi
  onOpenRelatedTask: (task: DartTask) => void
}

function GroupLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <h4 className="text-2xs uppercase tracking-wider text-muted-foreground">{children}</h4>
}

function EmptyLine({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <p className="text-xs text-muted-foreground">{children}</p>
}

function titlesError(load: DartLoad<unknown>): React.JSX.Element {
  return (
    <InlineError
      message={
        load.error ??
        translate(
          'auto.components.task.page.dart.TaskDetailRelationships.titlesError',
          'Could not load titles'
        )
      }
      onRetry={load.retry}
    />
  )
}

function OnHoldBanner({ openBlockers }: { openBlockers: number }): React.JSX.Element {
  return (
    <p
      role="status"
      className="flex items-center gap-2 rounded-md border border-annotation-highlight/30 bg-annotation-highlight/10 px-2.5 py-1.5 text-xs text-foreground"
    >
      <Ban className="size-3.5 flex-none" />
      {openBlockers === 1
        ? translate(
            'auto.components.task.page.dart.TaskDetailRelationships.onHoldOne',
            'On hold · waiting on 1 open blocker'
          )
        : translate(
            'auto.components.task.page.dart.TaskDetailRelationships.onHoldMany',
            'On hold · waiting on {{count}} open blockers',
            { count: openBlockers }
          )}
    </p>
  )
}

function ParentRow({
  parent,
  onOpen
}: {
  parent: DartLoad<DartTask>
  onOpen: (task: DartTask) => void
}): React.JSX.Element {
  return (
    <div className="space-y-1">
      <GroupLabel>
        {translate('auto.components.task.page.dart.TaskDetailRelationships.parent', 'Parent')}
      </GroupLabel>
      {parent.state === 'ready' && parent.data ? (
        <div className="flex items-center gap-1">
          <CornerLeftUp className="size-3.5 flex-none text-muted-foreground" aria-hidden />
          <DartRelatedTaskButton task={parent.data} onOpen={onOpen} />
        </div>
      ) : parent.state === 'error' ? (
        titlesError(parent)
      ) : (
        <SkeletonLines />
      )}
    </div>
  )
}

function BlockedByGroup({
  relationships,
  onOpen
}: {
  relationships: DartRelationshipsApi
  onOpen: (task: DartTask) => void
}): React.JSX.Element {
  const { blockers, task, blocked, pending } = relationships
  const current = blockers.state === 'ready' ? (blockers.data ?? []) : null
  const write = (ids: readonly string[]): void => void relationships.onSetBlockers(ids)
  // Write from Dart's id list, not the resolved rows: an unresolved id must not be dropped.
  const blockerIds = task.relationships?.blockerIds ?? (current ?? []).map((entry) => entry.id)
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <GroupLabel>
          {translate(
            'auto.components.task.page.dart.TaskDetailRelationships.blockedBy',
            'Blocked by'
          )}
        </GroupLabel>
        {pending ? (
          <span role="status" className="text-2xs text-muted-foreground">
            {translate('auto.components.task.page.dart.TaskDetailRelationships.saving', 'Saving…')}
          </span>
        ) : null}
      </div>
      {current === null ? (
        blockers.state === 'error' ? (
          titlesError(blockers)
        ) : (
          <SkeletonLines />
        )
      ) : (
        <>
          {current.length === 0 ? (
            <EmptyLine>
              {translate(
                'auto.components.task.page.dart.TaskDetailRelationships.noBlockers',
                'No blockers'
              )}
            </EmptyLine>
          ) : (
            <ul className="space-y-0.5">
              {current.map((blocker) => (
                <li key={blocker.id} className="flex items-center gap-1">
                  <DartRelatedTaskButton task={blocker} onOpen={onOpen} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    disabled={blocked}
                    aria-label={translate(
                      'auto.components.task.page.dart.TaskDetailRelationships.removeBlocker',
                      'Remove blocker {{title}}',
                      { title: blocker.title }
                    )}
                    onClick={() => write(blockerIds.filter((id) => id !== blocker.id))}
                  >
                    <X className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <DartBlockerPicker
            taskId={task.id}
            excludeIds={blockerIds}
            disabled={blocked}
            dartboardOnlyUnavailable={!task.dartboard}
            searchTasks={relationships.searchTasks}
            onPick={(picked) =>
              write(blockerIds.includes(picked.id) ? blockerIds : [...blockerIds, picked.id])
            }
          />
        </>
      )}
    </div>
  )
}

function BlockingGroup({
  blocking,
  onOpen
}: {
  blocking: DartLoad<readonly DartTask[]>
  onOpen: (task: DartTask) => void
}): React.JSX.Element {
  return (
    <div className="space-y-1">
      <GroupLabel>
        {translate('auto.components.task.page.dart.TaskDetailRelationships.blocking', 'Blocking')}
      </GroupLabel>
      {blocking.state === 'ready' ? (
        (blocking.data ?? []).length === 0 ? (
          <EmptyLine>
            {translate(
              'auto.components.task.page.dart.TaskDetailRelationships.noBlocking',
              'Not blocking any task'
            )}
          </EmptyLine>
        ) : (
          <ul className="space-y-0.5">
            {(blocking.data ?? []).map((blocked) => (
              <li key={blocked.id} className="flex items-center">
                <DartRelatedTaskButton task={blocked} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        )
      ) : blocking.state === 'error' ? (
        titlesError(blocking)
      ) : (
        <SkeletonLines />
      )}
      <EmptyLine>
        {translate(
          'auto.components.task.page.dart.TaskDetailRelationships.blockingHint',
          'Read-only here: change it on that task.'
        )}
      </EmptyLine>
    </div>
  )
}

export function TaskDetailRelationships({
  relationships,
  onOpenRelatedTask
}: TaskDetailRelationshipsProps): React.JSX.Element {
  const { state, task, blockers, parent, notice } = relationships
  const heading = (
    <SectionHeading>
      {translate('auto.components.task.page.dart.TaskDetailRelationships.heading', 'Relationships')}
    </SectionHeading>
  )
  if (state === 'notChecked') {
    return (
      <section className={SECTION_CLASS}>
        {heading}
        <p
          role="status"
          className="rounded-md border border-border/50 bg-muted/35 px-2.5 py-1.5 text-xs text-muted-foreground"
        >
          {translate(
            'auto.components.task.page.dart.TaskDetailRelationships.notChecked',
            "Dart did not return this task's links"
          )}
        </p>
      </section>
    )
  }
  if (state === 'loading' || state === 'error') {
    return (
      <section className={SECTION_CLASS}>
        {heading}
        {state === 'loading' ? (
          <SkeletonLines />
        ) : (
          <InlineError
            message={translate(
              'auto.components.task.page.dart.TaskDetailRelationships.linksError',
              "Could not load this task's links"
            )}
            onRetry={blockers.retry}
          />
        )}
      </section>
    )
  }
  const openBlockers =
    blockers.state === 'ready'
      ? (blockers.data ?? []).filter((t) => !isDartTaskFinished(t)).length
      : 0
  return (
    <section className={cn(SECTION_CLASS, 'space-y-3')}>
      {heading}
      {isDartTaskOnHold(task) && openBlockers > 0 ? (
        <OnHoldBanner openBlockers={openBlockers} />
      ) : null}
      {notice.notice?.field === 'relationships' ? <DartTaskDetailNotice {...notice} /> : null}
      {parent ? <ParentRow parent={parent} onOpen={onOpenRelatedTask} /> : null}
      <BlockedByGroup relationships={relationships} onOpen={onOpenRelatedTask} />
      <BlockingGroup blocking={relationships.blocking} onOpen={onOpenRelatedTask} />
    </section>
  )
}
