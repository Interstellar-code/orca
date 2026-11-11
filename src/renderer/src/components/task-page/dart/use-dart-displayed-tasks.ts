import { useMemo } from 'react'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import { applyDartBoardFilters } from './dart-board-columns'
import type { DartClientFilters, DartScopeMeta } from './dart-board-contracts'
import { filterLinkedDartTasks } from './task-page-dart-linked-issues'
import { buildDartRelationshipEntries, useDartRelationshipCache } from './dart-relationship-entries'
import { sortDartTasksByRecency } from './task-page-dart-list-model'
import {
  mergeDartPinnedRows,
  missingDartPinnedRows,
  type PinnedDartRow
} from './use-dart-list-pinned-rows'

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
  relationshipsHost: boolean
}): { tasks: readonly DartTask[]; totalCount: number; loadedCount: number } {
  const { boardPath, hasWorkspace, layout, baseTasks, localTotal, scopeMeta, search } = args
  const { pinnedRows, hostKey, accountKey, clientFilters, relationshipsHost } = args
  const relationshipCache = useDartRelationshipCache(relationshipsHost)
  const tasks = useMemo(() => {
    if (!boardPath) {
      const merged = mergeDartPinnedRows(baseTasks, pinnedRows, { hostKey, accountKey })
      return sortDartTasksByRecency(hasWorkspace ? filterLinkedDartTasks(merged, search) : merged)
    }
    const merged = mergeDartPinnedRows(baseTasks, pinnedRows, { hostKey, accountKey }, (read) =>
      applyDartBoardFilters(
        read,
        clientFilters,
        relationshipCache
          ? buildDartRelationshipEntries(
              read,
              relationshipCache,
              { hostKey, accountKey },
              scopeMeta?.publicationId
            )
          : undefined
      )
    )
    return layout === 'list' ? sortDartTasksByRecency(merged) : merged
  }, [
    boardPath,
    hasWorkspace,
    baseTasks,
    pinnedRows,
    hostKey,
    accountKey,
    search,
    layout,
    clientFilters,
    relationshipCache,
    scopeMeta?.publicationId
  ])
  const pinnedExtra = useMemo(
    () => missingDartPinnedRows(baseTasks, pinnedRows, { hostKey, accountKey }).length,
    [baseTasks, pinnedRows, hostKey, accountKey]
  )
  const openTotal = boardPath ? (scopeMeta?.openTotal ?? 0) : localTotal
  return {
    tasks,
    totalCount: openTotal + pinnedExtra,
    loadedCount: baseTasks.length + pinnedExtra
  }
}
