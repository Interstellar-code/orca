import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { Worktree } from '../../../../../shared/worktree/types'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { DartNestedListModel } from './dart-board-contracts'
import { TaskListNestedRows } from './TaskListNestedRows'
import { DartTaskRow, dartRowGridClass, type DartListRowActions } from './TaskListRow'

export type TaskPageDartTaskListProps = {
  tasks: readonly DartTask[]
  /** Absent = flat as release A. */
  nested?: DartNestedListModel
  selectedTaskId: string | null
  getTaskWorkspaces: (task: DartTask) => readonly Worktree[]
  onOpenTask: (task: DartTask) => void
  onStartWorkspace: (task: DartTask) => void
  onOpenWorkspace: (workspace: Worktree) => void
  /** Blocker markers for a row's right-side area. */
  rowMarkers?: (task: DartTask) => React.ReactNode
}

export function TaskPageDartTaskList({
  tasks,
  nested,
  selectedTaskId,
  getTaskWorkspaces,
  onOpenTask,
  onStartWorkspace,
  onOpenWorkspace,
  rowMarkers
}: TaskPageDartTaskListProps): React.JSX.Element {
  const actions: DartListRowActions = {
    selectedTaskId,
    getTaskWorkspaces,
    onOpenTask,
    onStartWorkspace,
    onOpenWorkspace,
    rowMarkers
  }
  // Why: a host that cannot read children (no relationships) lists no expandable row and keeps release A's columns.
  const showTags = nested !== undefined && nested.rows.some((row) => nested.canExpand(row.task))
  return (
    <div>
      <div
        className={cn(
          'grid items-center gap-3 border-b border-border/50 bg-muted/25 px-3 py-1.5 text-2xs text-muted-foreground @max-3xl:hidden',
          dartRowGridClass(showTags)
        )}
      >
        <span>{translate('auto.components.task.page.dart.TaskList.columnTask', 'Task')}</span>
        <span>{translate('auto.components.task.page.dart.TaskList.columnStatus', 'Status')}</span>
        <span>
          {translate('auto.components.task.page.dart.TaskList.columnPriority', 'Priority')}
        </span>
        <span>
          {translate('auto.components.task.page.dart.TaskList.columnAssignee', 'Assignee')}
        </span>
        {showTags ? (
          <span>{translate('auto.components.task.page.dart.TaskList.columnTags', 'Tags')}</span>
        ) : null}
        <span>{translate('auto.components.task.page.dart.TaskList.columnUpdated', 'Updated')}</span>
        <span />
      </div>
      {nested ? (
        <TaskListNestedRows model={nested} actions={actions} showTags={showTags} />
      ) : (
        <div className="divide-y divide-border/50">
          {tasks.map((task) => (
            <DartTaskRow
              key={task.id}
              task={task}
              selected={selectedTaskId === task.id}
              markers={rowMarkers?.(task)}
              workspaces={getTaskWorkspaces(task)}
              onOpenTask={onOpenTask}
              onStartWorkspace={onStartWorkspace}
              onOpenWorkspace={onOpenWorkspace}
            />
          ))}
        </div>
      )}
    </div>
  )
}
