import type { DartTask } from '../../../../../shared/dart/dart-types'
import { Button } from '@/components/ui/button'
import { openAppHttpLink } from '@/lib/app-http-link-open'
import { translate } from '@/i18n/i18n'
import { isDartTaskFinished } from './dart-board-columns'
import type { DartRelationshipsApi } from './dart-board-contracts'
import { DartRelatedTaskButton } from './DartRelatedTaskButton'
import { InlineError, SkeletonLines } from './TaskDetailLoadStates'
import { SectionHeading } from './TaskDetailSectionHeading'
import { getDartTaskOpenUrl } from './task-page-dart-list-model'

export type TaskDetailSubtasksProps = {
  relationships: DartRelationshipsApi
  onOpenRelatedTask: (task: DartTask) => void
}

export function TaskDetailSubtasks({
  relationships,
  onOpenRelatedTask
}: TaskDetailSubtasksProps): React.JSX.Element | null {
  const { subtasks, task, state } = relationships
  if (state === 'notChecked') {
    return null
  }
  const page = subtasks.state === 'ready' ? subtasks.data : null
  const loaded = page?.tasks ?? []
  const truncated = page !== null && (!page.complete || loaded.length < page.total)
  const done = loaded.filter(isDartTaskFinished).length
  const openUrl = getDartTaskOpenUrl(task)
  return (
    <section className="space-y-2 border-t border-border/60 px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <SectionHeading>
          {translate('auto.components.task.page.dart.TaskDetailSubtasks.heading', 'Subtasks')}
        </SectionHeading>
        {page && loaded.length > 0 ? (
          <span className="text-2xs text-muted-foreground">
            {truncated
              ? translate(
                  'auto.components.task.page.dart.TaskDetailSubtasks.loadedDone',
                  '{{done}} of {{loaded}} loaded done',
                  { done, loaded: loaded.length }
                )
              : translate(
                  'auto.components.task.page.dart.TaskDetailSubtasks.doneCount',
                  '{{done}} of {{total}} done',
                  { done, total: page.total }
                )}
          </span>
        ) : null}
      </div>
      {subtasks.state === 'error' ? (
        <InlineError
          message={
            subtasks.error ??
            translate(
              'auto.components.task.page.dart.TaskDetailSubtasks.error',
              'Could not load subtasks'
            )
          }
          onRetry={subtasks.retry}
        />
      ) : page === null ? (
        <SkeletonLines />
      ) : loaded.length === 0 && !truncated ? (
        <p className="text-xs text-muted-foreground">
          {translate('auto.components.task.page.dart.TaskDetailSubtasks.none', 'No subtasks')}
        </p>
      ) : loaded.length === 0 ? null : (
        <ul className="space-y-0.5">
          {loaded.map((subtask) => (
            <li key={subtask.id} className="flex items-center">
              <DartRelatedTaskButton task={subtask} onOpen={onOpenRelatedTask} />
            </li>
          ))}
        </ul>
      )}
      {truncated && page ? (
        <p className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
          {translate(
            'auto.components.task.page.dart.TaskDetailSubtasks.showing',
            'Showing {{loaded}} of {{total}}',
            { loaded: loaded.length, total: page.total }
          )}
          {openUrl ? (
            <>
              <span aria-hidden>·</span>
              <Button
                type="button"
                variant="link"
                size="xs"
                onClick={(event) => openAppHttpLink(openUrl, { event })}
              >
                {translate(
                  'auto.components.task.page.dart.TaskDetailSubtasks.openInDart',
                  'Open in Dart'
                )}
              </Button>
            </>
          ) : null}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {translate(
          'auto.components.task.page.dart.TaskDetailSubtasks.addLater',
          'Adding subtasks from Orca comes later.'
        )}
      </p>
    </section>
  )
}
