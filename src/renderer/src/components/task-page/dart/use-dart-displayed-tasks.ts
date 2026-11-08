import { useMemo } from 'react'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import { applyDartBoardFilters } from './dart-board-columns'
import type { DartClientFilters, DartScopeMeta } from './dart-board-contracts'
import { filterLinkedDartTasks } from './task-page-dart-linked-issues'
import { sortDartTasksByRecency } from './task-page-dart-list-model'
import { mergeDartPinnedRows, type PinnedDartRow } from './use-dart-list-pinned-rows'

/** The rows the tab shows: the loaded rows plus pinned ones, narrowed by the client filters, never stored back (D12). */
export function useDartDisplayedTasks(args: {
  boardPath: boolean
  hasWorkspace: boolean
  layout: 'list' | 'board'
  baseTasks: readonly DartTask[]
  localTotal: number
  scopeMeta: DartScopeMeta | null
  pinnedRows: ReadonlyMap<string, PinnedDartRow>
  hostKey: string
  accountKey: string
  search: string
  clientFilters: DartClientFilters
}): { tasks: readonly DartTask[]; totalCount: number; loadedCount: number } {
  const { boardPath, hasWorkspace, layout, baseTasks, localTotal, scopeMeta, search } = args
  const { pinnedRows, hostKey, accountKey, clientFilters } = args
  const merged = useMemo(
    () => mergeDartPinnedRows(baseTasks, pinnedRows, { hostKey, accountKey }),
    [baseTasks, pinnedRows, hostKey, accountKey]
  )
  const tasks = useMemo(() => {
    if (!boardPath) {
      return sortDartTasksByRecency(hasWorkspace ? filterLinkedDartTasks(merged, search) : merged)
    }
    const filtered = applyDartBoardFilters(merged, clientFilters)
    return layout === 'list' ? sortDartTasksByRecency(filtered) : filtered
  }, [boardPath, hasWorkspace, merged, search, layout, clientFilters])
  const openTotal = boardPath ? (scopeMeta?.openTotal ?? 0) : localTotal
  return {
    tasks,
    totalCount: openTotal + (merged.length - baseTasks.length),
    loadedCount: merged.length
  }
}
