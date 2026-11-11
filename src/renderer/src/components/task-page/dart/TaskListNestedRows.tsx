import { useId, useRef } from 'react'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { openAppHttpLink } from '@/lib/app-http-link-open'
import { isDartTaskFinished } from './dart-board-columns'
import type { DartNestedListModel, DartNestedListRow } from './dart-board-contracts'
import { DartTaskRow, type DartListRowActions } from './TaskListRow'
import { getDartTaskOpenUrl } from './task-page-dart-list-model'

const CHILD_READ_LIMIT = 250

function subtaskBadge(model: DartNestedListModel, task: DartTask): string | null {
  const page = model.children(task.id).data
  if (!page || page.tasks.length === 0) {
    return null
  }
  if (page.complete) {
    const done = page.tasks.filter(isDartTaskFinished).length
    return translate(
      'auto.components.task.page.dart.TaskList.subtasksDone',
      '{{done}} of {{total}} done',
      {
        done,
        total: page.total
      }
    )
  }
  return translate('auto.components.task.page.dart.TaskList.subtasksLoaded', '{{count}} loaded', {
    count: page.tasks.length
  })
}

function ChildGroupNotice({
  model,
  parent
}: {
  model: DartNestedListModel
  parent: DartTask
}): React.JSX.Element | null {
  const load = model.children(parent.id)
  const openUrl = getDartTaskOpenUrl(parent)
  const noticeClass =
    'flex min-h-8 items-center gap-2 py-1.5 pl-12 pr-3 text-xs text-muted-foreground'
  if (load.state === 'error') {
    return (
      <div className={noticeClass}>
        <span>
          {translate(
            'auto.components.task.page.dart.TaskList.subtasksFailed',
            'Could not load subtasks.'
          )}
        </span>
        <Button variant="ghost" size="xs" onClick={load.retry}>
          {translate('auto.components.task.page.dart.TaskList.retry', 'Retry')}
        </Button>
      </div>
    )
  }
  if (load.state === 'loading' && !load.data?.tasks.length) {
    return (
      <div className={noticeClass}>
        {translate('auto.components.task.page.dart.TaskList.subtasksLoading', 'Loading subtasks…')}
      </div>
    )
  }
  if (load.data && load.data.total > CHILD_READ_LIMIT) {
    const text = translate(
      'auto.components.task.page.dart.TaskList.subtasksTruncated',
      'Showing {{shown}} of {{total}} subtasks · Open in Dart',
      { shown: CHILD_READ_LIMIT, total: load.data.total }
    )
    return (
      <div className={noticeClass}>
        {openUrl ? (
          <Button
            variant="ghost"
            size="xs"
            onClick={(event) => openAppHttpLink(openUrl, { event })}
          >
            {text}
          </Button>
        ) : (
          <span>{text}</span>
        )}
      </div>
    )
  }
  return null
}

export function TaskListNestedRows({
  model,
  actions,
  showTags
}: {
  model: DartNestedListModel
  actions: DartListRowActions
  showTags: boolean
}): React.JSX.Element {
  const listId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const groupId = (taskId: string): string => `${listId}-children-${taskId}`

  const toggle = (task: DartTask): void => {
    const group = document.getElementById(groupId(task.id))
    if (group?.contains(document.activeElement)) {
      // Why: the focused child unmounts on collapse; preventScroll keeps the list where it is.
      containerRef.current
        ?.querySelector<HTMLElement>(`[data-dart-row-id="${CSS.escape(task.id)}"]`)
        ?.focus({ preventScroll: true })
    }
    model.toggle(task.id)
  }

  const renderRow = (row: DartNestedListRow): React.JSX.Element => {
    const { task } = row
    const expanded = row.depth === 0 && model.expanded.has(task.id)
    // Why: an expanded row keeps its button when the child read comes back empty, so focus is not lost.
    const canExpand = row.depth === 0 && (expanded || model.canExpand(task))
    return (
      <DartTaskRow
        key={task.id}
        task={task}
        selected={actions.selectedTaskId === task.id}
        depth={row.depth}
        showTags={showTags}
        gutter={showTags}
        expand={
          canExpand ? { expanded, controlsId: groupId(task.id), onToggle: toggle } : undefined
        }
        badge={canExpand ? subtaskBadge(model, task) : null}
        markers={actions.rowMarkers?.(task)}
        workspaces={actions.getTaskWorkspaces(task)}
        onOpenTask={actions.onOpenTask}
        onStartWorkspace={actions.onStartWorkspace}
        onOpenWorkspace={actions.onOpenWorkspace}
      />
    )
  }

  const blocks: React.JSX.Element[] = []
  for (let index = 0; index < model.rows.length; index += 1) {
    const parentRow = model.rows[index]
    if (parentRow.depth !== 0) {
      continue
    }
    const childRows: DartNestedListRow[] = []
    while (model.rows[index + 1]?.depth === 1) {
      index += 1
      childRows.push(model.rows[index])
    }
    const parent = parentRow.task
    const open = model.expanded.has(parent.id)
    blocks.push(
      <div key={parent.id} className="divide-y divide-border/50">
        {renderRow(parentRow)}
        {open ? (
          <div id={groupId(parent.id)} role="group" className="divide-y divide-border/50">
            {childRows.map(renderRow)}
            <ChildGroupNotice model={model} parent={parent} />
          </div>
        ) : null}
      </div>
    )
  }
  return (
    <div ref={containerRef} className="divide-y divide-border/50">
      {blocks}
    </div>
  )
}
