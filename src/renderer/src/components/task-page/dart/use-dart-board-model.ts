import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DartTask, DartWorkspaceConfig } from '../../../../../shared/dart/dart-types'
import type { DartLayout } from '../../../../../shared/dart/dart-saved-views'
import type { DartWriteResult } from '@/runtime/runtime-dart-write-client'
import { useAppStore } from '@/store'
import {
  applyDartBoardFilters,
  buildDartBoardColumns,
  buildDartCardInfo
} from './dart-board-columns'
import type {
  DartBoardColumn,
  DartBoardFeatures,
  DartBoardModel,
  DartCardInfo,
  DartClientFilters,
  DartLoad,
  DartScopeMeta,
  DartServerFilters
} from './dart-board-contracts'
import { enqueueDartTaskWrite } from './dart-task-write-queue'
import { mergeDartPinnedRows, type PinnedDartRow } from './use-dart-list-pinned-rows'

const NO_TASKS: readonly DartTask[] = []
const NO_COLUMNS: readonly DartBoardColumn[] = []
const NO_STATUSES: readonly string[] = []
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
  layout: DartLayout
  serverFilters: DartServerFilters
  clientFilters: DartClientFilters
  showEmptyColumns: boolean
  config: DartWorkspaceConfig | null
  features: DartBoardFeatures
  hostKey: string
  accountKey: string
  pinnedRows: ReadonlyMap<string, PinnedDartRow>
  onOpenTask(task: DartTask): void
}): DartBoardModel {
  const {
    scopeKey,
    layout,
    serverFilters,
    clientFilters,
    showEmptyColumns,
    config,
    features,
    hostKey,
    accountKey,
    pinnedRows,
    onOpenTask
  } = args
  const rows = useAppStore((state) =>
    scopeKey ? state.dartListCache[scopeKey]?.data?.tasks : undefined
  )
  const storedMeta = useAppStore((state) =>
    scopeKey ? state.dartScopeMetaCache[scopeKey] : undefined
  )
  const readMoreDone = useAppStore((state) => state.readMoreDone)
  const updateDartTask = useAppStore((state) => state.updateDartTask)
  const fetchDartTask = useAppStore((state) => state.fetchDartTask)
  const patchDartTask = useAppStore((state) => state.patchDartTask)
  const invalidateDartLists = useAppStore((state) => state.invalidateDartLists)
  const meta = storedMeta ?? EMPTY_META

  const { columns, cardInfoById } = useMemo(() => {
    const merged = mergeDartPinnedRows(rows ?? NO_TASKS, pinnedRows, { hostKey, accountKey })
    const filtered = applyDartBoardFilters(merged, clientFilters)
    const built =
      layout === 'board' && config
        ? buildDartBoardColumns(filtered, config, { showEmptyColumns })
        : NO_COLUMNS
    const info = new Map<string, DartCardInfo>()
    for (const column of built) {
      for (const task of column.tasks) {
        info.set(task.id, buildDartCardInfo(task))
      }
    }
    return { columns: built, cardInfoById: info }
  }, [rows, pinnedRows, hostKey, accountKey, clientFilters, layout, config, showEmptyColumns])

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
    void readMoreDone(serverFilters, { features }).then((result) => {
      if (token !== run.token) {
        return
      }
      run.running = false
      setDoneMoreState(
        result.ok ? { state: 'ready', error: null } : { state: 'error', error: result.error }
      )
    })
  }, [scopeKey, readMoreDone, serverFilters, features])

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
        write: () => updateDartTask(task.id, { status }),
        refresh: () => fetchDartTask(task.id, { force: true }),
        patch: (patch) => patchDartTask(identity, patch),
        invalidateLists: () => invalidateDartLists(identity)
      })
    },
    [hostKey, accountKey, updateDartTask, fetchDartTask, patchDartTask, invalidateDartLists]
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
      cardInfo,
      onMove,
      showMoreDone,
      onOpenTask
    ]
  )
}
