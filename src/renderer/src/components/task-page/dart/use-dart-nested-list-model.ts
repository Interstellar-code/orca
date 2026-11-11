import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import { useAppStore } from '@/store'
import { scopedDartCacheKey, type DartReadScope } from '@/store/slices/dart/dart-read-coordination'
import { dartTaskIdentity, dartTaskIdentityKey } from '@/store/slices/dart/dart-task-identity'
import { buildDartCardInfo, dartRelationshipEntryFor } from './dart-board-columns'
import type {
  DartCardInfo,
  DartLoad,
  DartNestedListModel,
  DartRelationshipCacheEntry,
  DartTaskPage
} from './dart-board-contracts'
import { dartLoadedChildren } from './dart-loaded-children'
import { buildDartTaskTree } from './dart-task-tree'

const SPINNER_DELAY_MS = 200
const NO_IDS: ReadonlySet<string> = new Set()
const NO_READS: Readonly<Record<string, ChildRead>> = {}

type ChildRead = { phase: 'running' | 'slow' } | { phase: 'error'; error: string }

type NestedListState = {
  readonly scopeId: string
  readonly expanded: ReadonlySet<string>
  readonly reads: Readonly<Record<string, ChildRead>>
}

function childrenCacheKey(scope: DartReadScope, parentId: string): string {
  return scopedDartCacheKey(scope, `list::children::${parentId}`)
}

export function useDartNestedListModel(args: {
  tasks: readonly DartTask[]
  nested: boolean
  pageScope: DartReadScope
  hostKey: string
  accountKey: string
  viewerId: string | null
  relationshipsHost: boolean
}): DartNestedListModel {
  const { tasks, nested, pageScope, hostKey, accountKey, viewerId, relationshipsHost } = args
  const scopeId = `${hostKey}\n${accountKey}`
  const listCache = useAppStore((state) => state.dartListCache)
  const relationshipCache = useAppStore((state) => state.dartRelationshipCache)
  const readDartSubtasks = useAppStore((state) => state.readDartSubtasks)

  const [state, setState] = useState<NestedListState>({
    scopeId,
    expanded: NO_IDS,
    reads: NO_READS
  })
  // A stale state from another host or account reads as empty until the next write replaces it.
  const current = state.scopeId === scopeId ? state : null
  const expanded = current?.expanded ?? NO_IDS
  const reads = current?.reads ?? NO_READS

  const live = useRef({ scopeId, pageScope })
  live.current = { scopeId, pageScope }
  const inflight = useRef(new Set<string>())
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending) {
        clearTimeout(timer)
      }
      pending.clear()
    }
  }, [])

  const writeReads = useCallback(
    (forScope: string, update: (reads: Record<string, ChildRead>) => Record<string, ChildRead>) => {
      setState((prev) => {
        if (forScope !== live.current.scopeId) {
          return prev
        }
        const base =
          prev.scopeId === forScope
            ? prev
            : { scopeId: forScope, expanded: NO_IDS, reads: NO_READS }
        return { ...base, reads: update({ ...base.reads }) }
      })
    },
    []
  )

  const readChildren = useCallback(
    (parentId: string, force: boolean): void => {
      const readScope = live.current.scopeId
      const flight = `${readScope}\n${parentId}`
      if (inflight.current.has(flight)) {
        return
      }
      inflight.current.add(flight)
      writeReads(readScope, (prev) => ({ ...prev, [parentId]: { phase: 'running' } }))
      const timer = setTimeout(() => {
        timers.current.delete(timer)
        writeReads(readScope, (prev) =>
          prev[parentId]?.phase === 'running' ? { ...prev, [parentId]: { phase: 'slow' } } : prev
        )
      }, SPINNER_DELAY_MS)
      timers.current.add(timer)
      void readDartSubtasks(parentId, { scope: live.current.pageScope, force }).then((result) => {
        clearTimeout(timer)
        timers.current.delete(timer)
        inflight.current.delete(flight)
        writeReads(readScope, (prev) => {
          delete prev[parentId]
          return result.ok ? prev : { ...prev, [parentId]: { phase: 'error', error: result.error } }
        })
      })
    },
    [readDartSubtasks, writeReads]
  )

  const canReadChildren = nested && relationshipsHost

  const toggle = useCallback(
    (taskId: string): void => {
      if (!canReadChildren) {
        return
      }
      const opening = !expanded.has(taskId)
      setState((prev) => {
        const base =
          prev.scopeId === scopeId ? prev : { scopeId, expanded: NO_IDS, reads: NO_READS }
        const next = new Set(base.expanded)
        if (!next.delete(taskId)) {
          next.add(taskId)
        }
        return { ...base, expanded: next }
      })
      if (opening) {
        // The store serves a fresh entry without a request and refetches a stale or invalidated one.
        readChildren(taskId, false)
      }
    },
    [canReadChildren, expanded, scopeId, readChildren]
  )

  // Entries of every listed parent too, so a newer copy under another parent still wins the dedupe.
  const childEntries = useMemo(() => {
    const byParent = new Map<string, readonly DartTask[]>()
    for (const task of tasks) {
      const entry = listCache[childrenCacheKey(pageScope, task.id)]?.data
      if (entry) {
        byParent.set(task.id, entry.tasks)
      }
    }
    return byParent
  }, [tasks, listCache, pageScope])

  const childPage = useCallback(
    (
      parentId: string
    ): { tasks: readonly DartTask[]; total: number; entryRead: boolean; entryKept: number } => {
      const entry = listCache[childrenCacheKey(pageScope, parentId)]?.data
      const lists = new Map(childEntries)
      if (entry) {
        lists.set(parentId, entry.tasks)
      }
      const loaded = dartLoadedChildren(parentId, tasks, [...lists.values()])
      const entryIds = new Set(entry?.tasks.map((task) => task.id))
      const entryKept = loaded.filter((task) => entryIds.has(task.id)).length
      const movedAway = (entry?.tasks.length ?? 0) - entryKept
      return {
        tasks: loaded,
        total: Math.max((entry?.totalCount ?? 0) - movedAway, loaded.length),
        entryRead: Boolean(entry),
        entryKept
      }
    },
    [listCache, pageScope, tasks, childEntries]
  )

  const children = useCallback(
    (taskId: string): DartLoad<DartTaskPage> => {
      const page = childPage(taskId)
      const read = reads[taskId]
      const data: DartTaskPage | null =
        page.entryRead || page.tasks.length > 0
          ? {
              tasks: page.tasks,
              total: page.total,
              complete: page.entryRead && page.total <= page.entryKept
            }
          : null
      const retry = (): void => readChildren(taskId, true)
      if (read?.phase === 'error') {
        return { state: 'error', data, error: read.error, retry }
      }
      if (read?.phase === 'slow') {
        return { state: 'loading', data, error: null, retry }
      }
      return { state: page.entryRead ? 'ready' : 'idle', data, error: null, retry }
    },
    [childPage, reads, readChildren]
  )

  const { rows, hiddenSubtasks } = useMemo(() => {
    const loaded = new Map<string, readonly DartTask[]>()
    if (nested) {
      for (const task of tasks) {
        const entry = listCache[childrenCacheKey(pageScope, task.id)]?.data
        if (entry) {
          loaded.set(task.id, entry.tasks)
        }
      }
    }
    return buildDartTaskTree(tasks, loaded, { nested })
  }, [tasks, nested, listCache, pageScope])

  // The tree builder nests under every parent; only expanded parents show their children.
  const visibleRows = useMemo(
    () =>
      nested ? rows.filter((row) => row.depth === 0 || expanded.has(row.parentId ?? '')) : rows,
    [rows, nested, expanded]
  )

  const relationshipsByTaskId = useMemo(() => {
    const byId = new Map<string, DartRelationshipCacheEntry>()
    if (!relationshipsHost) {
      return byId
    }
    for (const task of tasks) {
      const entry =
        relationshipCache[dartTaskIdentityKey(dartTaskIdentity(pageScope, task.id, viewerId))]
      if (entry) {
        byId.set(task.id, entry)
      }
    }
    return byId
  }, [tasks, relationshipCache, pageScope, viewerId, relationshipsHost])

  // List rows carry no links, so only a read relationship entry, a task's own links or loaded rows can rule a parent out.
  const canExpand = useCallback(
    (task: DartTask): boolean => {
      if (!canReadChildren || task.parentId) {
        return false
      }
      const page = childPage(task.id)
      if (page.tasks.length > 0) {
        return true
      }
      const known =
        relationshipsByTaskId.get(task.id)?.relationships?.subtaskIds ??
        task.relationships?.subtaskIds
      if (known) {
        return known.length > 0
      }
      return !page.entryRead
    },
    [canReadChildren, relationshipsByTaskId, childPage]
  )

  const cardInfo = useCallback(
    (taskId: string): DartCardInfo => {
      const task =
        tasks.find((candidate) => candidate.id === taskId) ??
        rows.find((row) => row.task.id === taskId)?.task ??
        ({ id: taskId, title: '', htmlUrl: '', tags: [] } satisfies DartTask)
      const relationships = dartRelationshipEntryFor(task, relationshipsByTaskId, relationshipsHost)
      const page = nested ? childPage(taskId) : null
      const loaded = page && (page.entryRead || page.tasks.length > 0) ? page.tasks : undefined
      return buildDartCardInfo(task, relationships, loaded)
    },
    [tasks, rows, relationshipsByTaskId, relationshipsHost, nested, childPage]
  )

  return useMemo(
    () => ({
      rows: visibleRows,
      nested,
      hiddenSubtasks,
      expanded,
      toggle,
      canExpand,
      children,
      cardInfo
    }),
    [visibleRows, nested, hiddenSubtasks, expanded, toggle, canExpand, children, cardInfo]
  )
}
