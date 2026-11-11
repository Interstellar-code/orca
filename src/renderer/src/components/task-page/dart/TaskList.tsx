import { ArrowRight, ExternalLink, Layers } from 'lucide-react'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { Worktree } from '../../../../../shared/worktree/types'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { openAppHttpLink } from '@/lib/app-http-link-open'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '../task-page-source-context'
import type { DartNestedListModel } from './dart-board-contracts'
import { getDartStatusTone, getDartTaskOpenUrl } from './task-page-dart-list-model'

const ROW_GRID_CLASS =
  'grid-cols-[minmax(0,1fr)_auto] @3xl:grid-cols-[minmax(0,1fr)_112px_88px_132px_88px_104px]'

export type TaskPageDartTaskListProps = {
  tasks: readonly DartTask[]
  /** Placeholder until B5: rows render flat; absent = flat as release A. */
  nested?: DartNestedListModel
  selectedTaskId: string | null
  getTaskWorkspaces: (task: DartTask) => readonly Worktree[]
  onOpenTask: (task: DartTask) => void
  onStartWorkspace: (task: DartTask) => void
  onOpenWorkspace: (workspace: Worktree) => void
}

function workspaceLabel(workspace: Worktree): string {
  return workspace.displayName || workspace.branch || workspace.path
}

function DartLinkedWorkspaceAction({
  task,
  workspaces,
  onOpenWorkspace,
  onStartWorkspace
}: {
  task: DartTask
  workspaces: readonly Worktree[]
  onOpenWorkspace: (workspace: Worktree) => void
  onStartWorkspace: (task: DartTask) => void
}): React.JSX.Element {
  const label = translate(
    'auto.components.task.page.dart.TaskList.linkedWorkspaceCount',
    '{{count}} workspaces linked to this task',
    {
      count: workspaces.length,
      defaultValue_one: '{{count}} workspace linked to this task'
    }
  )
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          aria-label={label}
          onClick={(event) => event.stopPropagation()}
        >
          <Layers className="size-3.5" />
          <span>{workspaces.length}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        {workspaces.map((workspace) => (
          <DropdownMenuItem key={workspace.id} onSelect={() => onOpenWorkspace(workspace)}>
            <Layers className="size-3.5" />
            <span className="min-w-0 truncate">{workspaceLabel(workspace)}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onStartWorkspace(task)}>
          <ArrowRight className="size-3.5" />
          {translate(
            'auto.components.task.page.dart.TaskList.startAnotherWorkspace',
            'Start new workspace'
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function DartTaskRow({
  task,
  selected,
  workspaces,
  onOpenTask,
  onStartWorkspace,
  onOpenWorkspace
}: {
  task: DartTask
  selected: boolean
  workspaces: readonly Worktree[]
  onOpenTask: (task: DartTask) => void
  onStartWorkspace: (task: DartTask) => void
  onOpenWorkspace: (workspace: Worktree) => void
}): React.JSX.Element {
  const openUrl = getDartTaskOpenUrl(task)
  const status = task.status ?? '—'
  return (
    // Why: the row holds action buttons, so a native button wrapper would nest buttons; role + keys keep it accessible.
    <div
      role="button"
      tabIndex={0}
      aria-current={selected ? 'true' : undefined}
      data-current={selected ? 'true' : undefined}
      onClick={() => onOpenTask(task)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) {
          return
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpenTask(task)
        }
      }}
      className={cn(
        'group/row grid min-h-12 cursor-pointer items-center gap-3 px-3 py-2 text-left transition hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        ROW_GRID_CLASS,
        selected && 'bg-accent'
      )}
    >
      <div className="min-w-0">
        <h3 className="truncate text-[13px] font-medium text-foreground">{task.title}</h3>
        <div className="mt-1 flex min-w-0 items-center gap-2 text-2xs text-muted-foreground">
          {task.dartboard ? <span className="min-w-0 truncate">{task.dartboard}</span> : null}
          {workspaces.length > 0 ? (
            <span className="inline-flex shrink-0 items-center gap-1">
              <Layers className="size-3" />
              {workspaceLabel(workspaces[0])}
            </span>
          ) : null}
          <span
            className={cn(
              'inline-flex min-w-0 max-w-28 items-center rounded-full border px-1.5 py-0.5 font-medium @3xl:hidden',
              getDartStatusTone(task.status)
            )}
          >
            <span className="truncate">{status}</span>
          </span>
        </div>
      </div>
      <div className="min-w-0 @max-3xl:hidden">
        <span
          className={cn(
            'inline-flex max-w-full items-center rounded-full border px-1.5 py-0.5 text-2xs font-medium',
            getDartStatusTone(task.status)
          )}
        >
          <span className="truncate">{status}</span>
        </span>
      </div>
      <span className="truncate text-xs text-foreground @max-3xl:hidden">
        {task.priority ?? '—'}
      </span>
      <span className="truncate text-xs text-foreground @max-3xl:hidden">
        {task.assignee ??
          translate('auto.components.task.page.dart.TaskList.unassigned', 'Unassigned')}
      </span>
      <span className="truncate text-xs text-muted-foreground @max-3xl:hidden">
        {task.updatedAt ? formatRelativeTime(task.updatedAt) : '—'}
      </span>
      <div className="flex shrink-0 items-center justify-end gap-1">
        {workspaces.length > 0 ? (
          <DartLinkedWorkspaceAction
            task={task}
            workspaces={workspaces}
            onOpenWorkspace={onOpenWorkspace}
            onStartWorkspace={onStartWorkspace}
          />
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={(event) => {
                  event.stopPropagation()
                  onStartWorkspace(task)
                }}
                aria-label={translate(
                  'auto.components.task.page.dart.TaskList.startWorkspaceFrom',
                  'Start workspace from {{value0}}',
                  { value0: task.title }
                )}
              >
                <ArrowRight className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              {translate(
                'auto.components.task.page.dart.TaskList.startWorkspace',
                'Start workspace'
              )}
            </TooltipContent>
          </Tooltip>
        )}
        {openUrl ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={(event) => {
                  event.stopPropagation()
                  openAppHttpLink(openUrl, { event })
                }}
                aria-label={translate(
                  'auto.components.task.page.dart.TaskList.openInDartNamed',
                  'Open {{value0}} in Dart',
                  { value0: task.title }
                )}
              >
                <ExternalLink className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              {translate('auto.components.task.page.dart.TaskList.openInDart', 'Open in Dart')}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </div>
  )
}

export function TaskPageDartTaskList({
  tasks,
  nested,
  selectedTaskId,
  getTaskWorkspaces,
  onOpenTask,
  onStartWorkspace,
  onOpenWorkspace
}: TaskPageDartTaskListProps): React.JSX.Element {
  return (
    <div>
      <div
        className={cn(
          'grid items-center gap-3 border-b border-border/50 bg-muted/25 px-3 py-1.5 text-2xs text-muted-foreground @max-3xl:hidden',
          ROW_GRID_CLASS
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
        <span>{translate('auto.components.task.page.dart.TaskList.columnUpdated', 'Updated')}</span>
        <span />
      </div>
      <div className="divide-y divide-border/50">
        {(nested ? nested.rows.map((row) => row.task) : tasks).map((task) => (
          <DartTaskRow
            key={task.id}
            task={task}
            selected={selectedTaskId === task.id}
            workspaces={getTaskWorkspaces(task)}
            onOpenTask={onOpenTask}
            onStartWorkspace={onStartWorkspace}
            onOpenWorkspace={onOpenWorkspace}
          />
        ))}
      </div>
    </div>
  )
}
