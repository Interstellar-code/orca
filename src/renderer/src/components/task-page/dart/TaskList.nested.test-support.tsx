import { useMemo, useState } from 'react'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { DartLoad, DartNestedListModel, DartTaskPage } from './dart-board-contracts'
import { reconcileDartTasks } from './dart-loaded-children'
import { buildDartNestedRows } from './dart-task-tree'

export type StubNestedListOptions = {
  /** The page scope's rows. */
  tasks: readonly DartTask[]
  /** Children fetched on expand, by parent id; may include tasks absent from `tasks`. */
  fetched?: Readonly<Record<string, readonly DartTask[]>>
  /** Server totals by parent id; absent = the loaded count. */
  totals?: Readonly<Record<string, number>>
  failed?: ReadonlySet<string>
  retry?: (parentId: string) => void
  initiallyExpanded?: readonly string[]
}

/** A stand-in for useDartNestedListModel that keeps only expand state; the real model has its own tests. */
export function useStubNestedListModel(options: StubNestedListOptions): DartNestedListModel {
  const { tasks, fetched = {}, totals = {}, failed, retry } = options
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(options.initiallyExpanded)
  )
  return useMemo(() => {
    const reconciled = reconcileDartTasks(tasks, Object.values(fetched))
    const { rows, hiddenSubtasks } = buildDartNestedRows(reconciled)
    const children = (parentId: string): DartLoad<DartTaskPage> => {
      const loaded = reconciled.childrenOf(parentId)
      const total = Math.max(totals[parentId] ?? loaded.length, loaded.length)
      return {
        state: failed?.has(parentId) ? 'error' : 'ready',
        data: { tasks: loaded, total, complete: total <= loaded.length },
        error: failed?.has(parentId) ? 'boom' : null,
        retry: () => retry?.(parentId)
      }
    }
    return {
      rows: rows.filter((row) => row.depth === 0 || expanded.has(row.parentId ?? '')),
      nested: true,
      hiddenSubtasks,
      expanded,
      toggle: (taskId) =>
        setExpanded((prev) => {
          const next = new Set(prev)
          if (!next.delete(taskId)) {
            next.add(taskId)
          }
          return next
        }),
      canExpand: (task) =>
        !task.parentId && (totals[task.id] ?? reconciled.childrenOf(task.id).length) > 0,
      children,
      cardInfo: (taskId) => ({
        task: tasks.find((task) => task.id === taskId) ?? tasks[0],
        onHold: false
      })
    }
  }, [tasks, fetched, totals, failed, retry, expanded])
}
