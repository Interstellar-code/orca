import { ArrowRight, ChevronDown, ChevronRight, ExternalLink, Layers } from 'lucide-react'
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
import { getDartStatusTone, getDartTaskOpenUrl } from './task-page-dart-list-model'

// Why: literal class strings so Tailwind's scanner sees them.
const ROW_GRID_CLASS =
  'grid-cols-[minmax(0,1fr)_auto] @3xl:grid-cols-[minmax(0,1fr)_112px_88px_132px_88px_104px]'
const ROW_GRID_TAGS_CLASS =
  'grid-cols-[minmax(0,1fr)_auto] @3xl:grid-cols-[minmax(0,1fr)_112px_88px_132px_120px_88px_104px]'
export function dartRowGridClass(showTags: boolean): string {
  return showTags ? ROW_GRID_TAGS_CLASS : ROW_GRID_CLASS
}

export type DartListRowActions = {
  selectedTaskId: string | null
  getTaskWorkspaces: (task: DartTask) => readonly Worktree[]
  onOpenTask: (task: DartTask) => void
  onStartWorkspace: (task: DartTask) => void
  onOpenWorkspace: (workspace: Worktree) => void
  /** Blocker markers for a row's right-side area; absent = none. */
  rowMarkers?: (task: DartTask) => React.ReactNode
}

export type DartRowExpand = {
  readonly expanded: boolean
  readonly controlsId: string
  onToggle(task: DartTask): void
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

export function DartTaskRow({
  task,
  selected,
  depth = 0,
  showTags = false,
  gutter = false,
  expand,
  badge,
  markers,
  workspaces,
  onOpenTask,
  onStartWorkspace,
  onOpenWorkspace
}: {
  task: DartTask
  selected: boolean
  depth?: 0 | 1
  showTags?: boolean
  /** Reserves the expand button's width so titles line up on a relationships host. */
  gutter?: boolean
  expand?: DartRowExpand
  badge?: string | null
  /** Blocker markers (B5 part 2) render here, before the action buttons. */
  markers?: React.ReactNode
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
      data-dart-row-id={task.id}
      aria-current={selected ? 'true' : undefined}
      data-current={selected ? 'true' : undefined}
      onClick={() => onOpenTask(task)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) {
          return
        }
        if (expand && event.key === 'ArrowRight' && !expand.expanded) {
          event.preventDefault()
          expand.onToggle(task)
          return
        }
        if (expand && event.key === 'ArrowLeft' && expand.expanded) {
          event.preventDefault()
          expand.onToggle(task)
          return
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpenTask(task)
        }
      }}
      className={cn(
        'group/row grid min-h-12 cursor-pointer items-center gap-3 px-3 py-2 text-left transition hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        dartRowGridClass(showTags),
        depth === 1 && 'pl-14',
        selected && 'bg-accent'
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {expand ? (
          <Button
            variant="ghost"
            size="icon-xs"
            className="shrink-0"
            aria-expanded={expand.expanded}
            aria-controls={expand.controlsId}
            aria-label={
              expand.expanded
                ? translate(
                    'auto.components.task.page.dart.TaskList.collapseSubtasks',
                    'Collapse subtasks of {{value0}}',
                    { value0: task.title }
                  )
                : translate(
                    'auto.components.task.page.dart.TaskList.expandSubtasks',
                    'Expand subtasks of {{value0}}',
                    { value0: task.title }
                  )
            }
            onClick={(event) => {
              event.stopPropagation()
              expand.onToggle(task)
            }}
          >
            {expand.expanded ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
          </Button>
        ) : gutter && depth === 0 ? (
          <span className="size-6 shrink-0" aria-hidden />
        ) : null}
        <div className="min-w-0">
          <h3 className="truncate text-[13px] font-medium text-foreground">{task.title}</h3>
          <div className="mt-1 flex min-w-0 items-center gap-2 text-2xs text-muted-foreground">
            {task.dartboard ? <span className="min-w-0 truncate">{task.dartboard}</span> : null}
            {badge ? (
              <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 font-medium">
                {badge}
              </span>
            ) : null}
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
      {showTags ? (
        <span className="truncate text-xs text-muted-foreground @max-3xl:hidden">
          {task.tags.join(', ')}
        </span>
      ) : null}
      <span className="truncate text-xs text-muted-foreground @max-3xl:hidden">
        {task.updatedAt ? formatRelativeTime(task.updatedAt) : '—'}
      </span>
      <div className="flex shrink-0 items-center justify-end gap-1">
        {markers}
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
