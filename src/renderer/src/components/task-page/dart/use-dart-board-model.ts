import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DartTask, DartWorkspaceConfig } from '../../../../../shared/dart/dart-types'
import type { DartLayout } from '../../../../../shared/dart/dart-saved-views'
import type { DartWriteResult } from '@/runtime/runtime-dart-write-client'
import { useAppStore } from '@/store'
import {
  applyDartBoardFilters,
  buildDartBoardColumns,
  buildDartCardInfo,
  dartRelationshipEntryFor,
  isDartTaskOnHold
} from './dart-board-columns'
import type {
  DartBoardColumn,
  DartBoardFeatures,
  DartBoardModel,
  DartCardInfo,
  DartClientFilters,
  DartLoad,
  DartRelationshipCacheEntry,
  DartScopeMeta,
  DartServerFilters
} from './dart-board-contracts'
import { scopedDartCacheKey, type DartReadScope } from '@/store/slices/dart/dart-read-coordination'
import { dartTaskIdentityKey } from '@/store/slices/dart/dart-task-identity'
import { useDartOnHoldCheckMore } from './use-dart-on-hold-check-more'
import { useDartOnHoldPublication } from './use-dart-on-hold-relationship-reads'
import { dartLoadedChildren } from './dart-loaded-children'
import { enqueueDartTaskWrite } from './dart-task-write-queue'
import { mergeDartPinnedRows, type PinnedDartRow } from './use-dart-list-pinned-rows'

const NO_TASKS: readonly DartTask[] = []
const NO_COLUMNS: readonly DartBoardColumn[] = []
const NO_STATUSES: readonly string[] = []
const CHILDREN_ENTRY_PREFIX = 'list::children::'
const EMPTY_META: DartScopeMeta = {
  fetchedAt: 0,
  openTotal: 0,
  doneTotal: 0,
  doneOffset: 0,
  generation: 0,
  incomplete: false,
  partialReason: null
}

type DoneMoreState = { state: DartLoad<null>['state']; error: string | null }
const IDLE_DONE_MORE: DoneMoreState = { state: 'idle', error: null }

function foldStatus(status: string | null | undefined): string {
  return (status ?? '').toLowerCase()
}

export function useDartBoardModel(args: {
  scopeKey: string | null
  pageScope: DartReadScope
  layout: DartLayout
  serverFilters: DartServerFilters
  clientFilters: DartClientFilters
  showEmptyColumns: boolean
  /** Effective nesting from the caller (D13.1, D13.2); subtasks leave the columns and parents count them. */
  nested: boolean
  config: DartWorkspaceConfig | null
  features: DartBoardFeatures
  hostKey: string
  accountKey: string
  pinnedRows: ReadonlyMap<string, PinnedDartRow>
  onOpenTask(task: DartTask): void
}): DartBoardModel {
  const {
    scopeKey,
    pageScope,
    layout,
    serverFilters,
    clientFilters,
    showEmptyColumns,
    nested,
    config,
    features,
    hostKey,
    accountKey,
    pinnedRows,
    onOpenTask
  } = args
  const relationshipsHost = features.relationships === true
  const rows = useAppStore((state) =>
    scopeKey ? state.dartListCache[scopeKey]?.data?.tasks : undefined
  )
  const storedMeta = useAppStore((state) =>
    scopeKey ? state.dartScopeMetaCache[scopeKey] : undefined
  )
  // Selected only where it is read, so a host without relationships has no extra subscription.
  const relationshipCache = useAppStore((state) =>
    relationshipsHost ? state.dartRelationshipCache : undefined
  )
  const listCache = useAppStore((state) =>
    relationshipsHost && nested ? state.dartListCache : undefined
  )
  const readDartOnHoldRelationships = useAppStore((state) => state.readDartOnHoldRelationships)
  const readMoreDone = useAppStore((state) => state.readMoreDone)
  const updateDartTask = useAppStore((state) => state.updateDartTask)
  const fetchDartTask = useAppStore((state) => state.fetchDartTask)
  const patchDartTask = useAppStore((state) => state.patchDartTask)
  const invalidateDartLists = useAppStore((state) => state.invalidateDartLists)
  const meta = storedMeta ?? EMPTY_META

  const childrenKeyPrefix = scopedDartCacheKey(pageScope, CHILDREN_ENTRY_PREFIX)

  // Unfiltered scope rows with pins, so counts and the blocked filter see every on-hold task.
  const relationshipView = useMemo(() => {
    if (!relationshipsHost) {
      return null
    }
    const candidates = mergeDartPinnedRows(rows ?? NO_TASKS, pinnedRows, { hostKey, accountKey })
    const cached = new Map<string, DartRelationshipCacheEntry>()
    const entries = new Map<string, DartRelationshipCacheEntry>()
    const unchecked: string[] = []
    const errored = new Set<string>()
    for (const task of candidates) {
      const entry =
        relationshipCache?.[dartTaskIdentityKey({ hostKey, accountKey, taskId: task.id })]
      if (entry) {
        cached.set(task.id, entry)
      }
      const resolved = dartRelationshipEntryFor(task, cached, true)
      if (resolved) {
        entries.set(task.id, resolved)
      }
      if (
        isDartTaskOnHold(task) &&
        (!entry || entry.state === 'notChecked' || entry.state === 'error')
      ) {
        unchecked.push(task.id)
        if (entry?.state === 'error') {
          errored.add(task.id)
        }
      }
    }
    return { candidates, entries, unchecked, errored }
  }, [relationshipsHost, rows, pinnedRows, hostKey, accountKey, relationshipCache])

  const { columns, cardInfoById } = useMemo(() => {
    const entries = relationshipView?.entries
    const merged = mergeDartPinnedRows(
      rows ?? NO_TASKS,
      pinnedRows,
      { hostKey, accountKey },
      (read) => applyDartBoardFilters(read, clientFilters, entries)
    )
    const built =
      layout === 'board' && config
        ? buildDartBoardColumns(merged, config, { showEmptyColumns, nested })
        : NO_COLUMNS
    // Every children entry of the scope, so a child that moved to another parent counts only there (D13.4).
    const childrenEntries: (readonly DartTask[])[] = []
    if (relationshipView && nested && listCache) {
      for (const [key, entry] of Object.entries(listCache)) {
        if (key.startsWith(childrenKeyPrefix) && entry.data) {
          childrenEntries.push(entry.data.tasks)
        }
      }
    }
    const loadedChildrenOf = (taskId: string): readonly DartTask[] | undefined => {
      if (!relationshipView || !nested) {
        return undefined
      }
      const all = dartLoadedChildren(taskId, relationshipView.candidates, childrenEntries)
      return all.length > 0 ? all : undefined
    }
    const info = new Map<string, DartCardInfo>()
    for (const column of built) {
      for (const task of column.tasks) {
        info.set(task.id, buildDartCardInfo(task, entries?.get(task.id), loadedChildrenOf(task.id)))
      }
    }
    return { columns: built, cardInfoById: info }
  }, [
    rows,
    pinnedRows,
    hostKey,
    accountKey,
    clientFilters,
    layout,
    config,
    showEmptyColumns,
    nested,
    relationshipView,
    listCache,
    childrenKeyPrefix
  ])

  const notChecked = relationshipView?.unchecked.length
  const publication = useDartOnHoldPublication(relationshipsHost, scopeKey, storedMeta, rows)
  const checkMore = useDartOnHoldCheckMore({
    unchecked: relationshipView?.unchecked,
    errored: relationshipView?.errored,
    publication,
    read: readDartOnHoldRelationships
  })

  const statuses = useMemo(() => (config ? [...config.statuses] : NO_STATUSES), [config])
  const hasMoreDone = meta.doneOffset < meta.doneTotal

  // A reply counts only for the scope and mount that started it.
  const [doneMoreState, setDoneMoreState] = useState<DoneMoreState>(IDLE_DONE_MORE)
  const doneMoreRun = useRef({ token: 0, running: false })
  useEffect(() => {
    const run = doneMoreRun.current
    run.token += 1
    run.running = false
    setDoneMoreState(IDLE_DONE_MORE)
    return () => {
      run.token += 1
      run.running = false
    }
  }, [scopeKey])

  const showMoreDone = useCallback((): void => {
    const run = doneMoreRun.current
    if (!scopeKey || run.running) {
      return
    }
    run.running = true
    const { token } = run
    setDoneMoreState({ state: 'loading', error: null })
    void readMoreDone(serverFilters, { features, scope: pageScope }).then((result) => {
      if (token !== run.token) {
        return
      }
      run.running = false
      setDoneMoreState(
        result.ok ? { state: 'ready', error: null } : { state: 'error', error: result.error }
      )
    })
  }, [scopeKey, readMoreDone, serverFilters, features, pageScope])

  const doneMore = useMemo<DartLoad<null>>(
    () => ({
      state: doneMoreState.state,
      data: null,
      error: doneMoreState.error,
      retry: showMoreDone
    }),
    [doneMoreState, showMoreDone]
  )

  const cardInfo = useCallback(
    (taskId: string): DartCardInfo => {
      const known = cardInfoById.get(taskId)
      if (known) {
        return known
      }
      return buildDartCardInfo({ id: taskId, title: '', htmlUrl: '', tags: [] })
    },
    [cardInfoById]
  )

  const onMove = useCallback(
    (task: DartTask, status: string): Promise<DartWriteResult<{ task: DartTask }>> => {
      if (foldStatus(task.status) === foldStatus(status)) {
        return Promise.resolve({ ok: true, task })
      }
      const identity = { hostKey, accountKey, taskId: task.id }
      return enqueueDartTaskWrite({
        identity,
        previous: task,
        optimistic: { status },
        write: () => updateDartTask(task.id, { status }, { scope: pageScope }),
        refresh: () => fetchDartTask(task.id, { force: true, scope: pageScope }),
        patch: (patch) => patchDartTask(identity, patch),
        invalidateLists: () => invalidateDartLists(identity)
      })
    },
    [
      hostKey,
      accountKey,
      pageScope,
      updateDartTask,
      fetchDartTask,
      patchDartTask,
      invalidateDartLists
    ]
  )

  return useMemo(
    () => ({
      columns,
      statuses,
      hostKey,
      accountKey,
      showEmptyColumns,
      meta,
      hasMoreDone,
      doneMore,
      features,
      ...(checkMore ? { notChecked, checkMore } : {}),
      cardInfo,
      onMove,
      showMoreDone,
      onOpenTask
    }),
    [
      columns,
      statuses,
      hostKey,
      accountKey,
      showEmptyColumns,
      meta,
      hasMoreDone,
      doneMore,
      features,
      notChecked,
      checkMore,
      cardInfo,
      onMove,
      showMoreDone,
      onOpenTask
    ]
  )
}
