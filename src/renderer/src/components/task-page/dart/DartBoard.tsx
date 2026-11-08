import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { isDartBoardDragFromHost, readDartBoardTaskDragData } from '@/lib/dart-board-drag-payload'
import type { DartBoardColumn as DartBoardColumnData, DartBoardProps } from './dart-board-contracts'
import { DartBoardCard } from './DartBoardCard'
import { DartBoardColumn, dartColumnLabel } from './DartBoardColumn'

type PendingFocus = { taskId: string; settled: boolean }

export function DartBoard({ model, selectedTaskId }: DartBoardProps): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  const pendingFocus = useRef<PendingFocus | null>(null)
  const [focusTick, setFocusTick] = useState(0)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
  const [menuTaskId, setMenuTaskId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const placement = useMemo(() => {
    const byId = new Map<string, { task: DartTask; column: DartBoardColumnData }>()
    for (const column of model.columns) {
      for (const task of column.tasks) {
        byId.set(task.id, { task, column })
      }
    }
    return byId
  }, [model.columns])

  // A refresh that drops the task closes its open menu and cancels its drag (D4.2).
  useEffect(() => {
    if (menuTaskId && !placement.has(menuTaskId)) {
      setMenuTaskId(null)
    }
    if (draggingId && !placement.has(draggingId)) {
      setDraggingId(null)
      setDragOverKey(null)
    }
  }, [placement, menuTaskId, draggingId])

  useLayoutEffect(() => {
    const pending = pendingFocus.current
    if (!pending) {
      return
    }
    const focusCard = (): void => {
      const card = rootRef.current?.querySelector<HTMLElement>(
        `[data-dart-card-id="${CSS.escape(pending.taskId)}"]`
      )
      card?.focus({ preventScroll: true })
      card?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
    focusCard()
    // Why: a closing menu restores focus to its trigger after this commit.
    const timer = window.setTimeout(focusCard, 0)
    if (pending.settled) {
      pendingFocus.current = null
    }
    return () => window.clearTimeout(timer)
  }, [model.columns, focusTick])

  const announce = useCallback((message: string) => {
    setAnnouncement('')
    queueMicrotask(() => setAnnouncement(message))
  }, [])

  const moveTask = useCallback(
    async (task: DartTask, status: string): Promise<void> => {
      pendingFocus.current = { taskId: task.id, settled: false }
      const result = await model.onMove(task, status)
      if (result.ok) {
        announce(
          translate('auto.components.task.page.dart.DartBoard.moved', 'Moved to {{status}}', {
            status: result.task.status || status
          })
        )
      } else {
        announce(result.error)
      }
      pendingFocus.current = { taskId: task.id, settled: true }
      setFocusTick((tick) => tick + 1)
    },
    [model, announce]
  )

  const handleDragOver = (
    event: React.DragEvent<HTMLElement>,
    column: DartBoardColumnData
  ): void => {
    if (!draggingId) {
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const source = placement.get(draggingId)
    setDragOverKey(column.inConfig && source?.column.key !== column.key ? column.key : null)
  }

  const handleDrop = (event: React.DragEvent<HTMLElement>, column: DartBoardColumnData): void => {
    event.preventDefault()
    event.stopPropagation()
    setDragOverKey(null)
    const read = readDartBoardTaskDragData(event.dataTransfer)
    const taskId =
      read.status === 'hidden' ? draggingId : isDartBoardDragFromHost(read, model.hostKey)?.taskId
    setDraggingId(null)
    const source = taskId ? placement.get(taskId) : undefined
    if (!source || source.column.key === column.key) {
      return
    }
    if (!column.inConfig) {
      announce(
        translate(
          'auto.components.task.page.dart.DartBoard.statusNotInConfig',
          'This status is not in the workspace settings'
        )
      )
      return
    }
    void moveTask(source.task, column.status)
  }

  return (
    <div ref={rootRef} data-dart-board className="flex min-w-0 flex-col gap-2 p-3">
      {model.showEmptyColumns ? (
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.task.page.dart.DartBoard.wholeWorkspaceHint',
            'Includes statuses from the whole workspace.'
          )}
        </p>
      ) : null}
      <div className="flex min-w-0 items-start gap-3 overflow-x-auto scrollbar-sleek">
        {model.columns.map((column) => (
          <DartBoardColumn
            key={column.key}
            column={column}
            dropTarget={dragOverKey === column.key}
            onDragOver={(event) => handleDragOver(event, column)}
            onDrop={(event) => handleDrop(event, column)}
          >
            {column.tasks.map((task) => (
              <DartBoardCard
                key={task.id}
                task={task}
                model={model}
                current={task.id === selectedTaskId}
                menuOpen={menuTaskId === task.id}
                onMenuOpenChange={(open) => setMenuTaskId(open ? task.id : null)}
                onMoveTo={(status) => void moveTask(task, status)}
                onDragStartTask={() => setDraggingId(task.id)}
                onDragEndTask={() => {
                  setDraggingId(null)
                  setDragOverKey(null)
                }}
              />
            ))}
          </DartBoardColumn>
        ))}
      </div>
      {model.hasMoreDone ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={model.doneMore.state === 'loading'}
            onClick={model.showMoreDone}
          >
            {translate(
              'auto.components.task.page.dart.DartBoard.showMoreFinished',
              'Show 50 more finished'
            )}
          </Button>
        </div>
      ) : null}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  )
}

export { dartColumnLabel }
