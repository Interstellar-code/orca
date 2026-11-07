import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction
} from 'react'
import type { DartBoardFilters } from '../../../../../shared/dart/dart-saved-views'
import type {
  DartHostFeatures,
  DartTask,
  DartTaskPage,
  DartWorkspaceConfig
} from '../../../../../shared/dart/dart-types'
import type { DartListTasksArgs } from '../../../../../shared/rpc-contract/dart-params'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import type { LinkedDartTaskRef } from '@/lib/dart-issue-workspace-attachment'
import { taskProviderErrorMessage } from '@/lib/task-provider-error-copy'
import type { DartClientResult } from '@/runtime/runtime-dart-client'
import type { DartSlice } from '@/store/slices/dart/dart-slice-contract'
import { captureDartEpoch } from '@/store/slices/dart/dart-task-identity'
import type { DartServerFilters } from './dart-board-contracts'
import { readPastDartWrites } from './dart-stale-read'
import { withPendingDartPatches } from './dart-task-write-queue'
import { readLinkedDartTasks } from './task-page-dart-linked-issues'
import { buildDartListArgs } from './task-page-dart-list-model'

export type TaskPageDartError = { message: string; code?: string }

type DartListOutcome = {
  tasks: DartTask[]
  totalCount: number
  error: TaskPageDartError | null
}

export type DartListReadActions = {
  listDartTasks: (
    args?: DartListTasksArgs,
    options?: { force?: boolean }
  ) => Promise<DartClientResult<DartTaskPage>>
  fetchDartTask: (
    taskId: string,
    options?: { sourceContext?: TaskSourceContext | null; force?: boolean }
  ) => Promise<DartClientResult<{ task: DartTask }>>
  fetchDartConfig: (options?: {
    force?: boolean
  }) => Promise<DartClientResult<{ config: DartWorkspaceConfig }>>
  readDartScope: DartSlice['readDartScope']
  publishDartScope: DartSlice['publishDartScope']
  openDartDetailPage?: (task: DartTask) => void
}

/** Reads the tab's tasks: the scope reads on a board host, phase 2's list or linked reads otherwise (D11). */
export function useDartListRead(args: {
  active: boolean
  featuresReady: boolean
  boardPath: boolean
  hostFeatures: DartHostFeatures | null
  listKey: string
  filters: DartBoardFilters
  serverFilters: DartServerFilters
  hasWorkspace: boolean
  linkedRefs: readonly LinkedDartTaskRef[]
  linkedRefsSignature: string
  sourceContext: TaskSourceContext | null
  refreshNonce: number
  hostKey: string
  accountKey: string
  viewerId: string | null
  actionsRef: MutableRefObject<DartListReadActions>
  clearPinsOnNewList: (pinKey: string) => void
  setDartTasks: Dispatch<SetStateAction<DartTask[]>>
  setDartTotalCount: Dispatch<SetStateAction<number>>
}): { dartLoading: boolean; dartError: TaskPageDartError | null } {
  const {
    active,
    featuresReady,
    boardPath,
    hostFeatures,
    listKey,
    filters,
    serverFilters,
    hasWorkspace,
    linkedRefs,
    linkedRefsSignature,
    sourceContext,
    refreshNonce,
    hostKey,
    accountKey,
    viewerId,
    actionsRef,
    clearPinsOnNewList,
    setDartTasks,
    setDartTotalCount
  } = args
  const [dartLoading, setDartLoading] = useState(false)
  const [dartError, setDartError] = useState<TaskPageDartError | null>(null)
  const shownRowsKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!active || !featuresReady) {
      return
    }
    let cancelled = false
    clearPinsOnNewList(JSON.stringify([hostKey, listKey, hasWorkspace, refreshNonce, boardPath]))
    setDartLoading(true)
    setDartError(null)
    const force = refreshNonce > 0
    if (boardPath) {
      const features = hostFeatures ?? { board: false }
      void readPastDartWrites({
        captureEpoch: () => captureDartEpoch({ hostKey }),
        cancelled: () => cancelled,
        force,
        read: () => actionsRef.current.readDartScope(serverFilters, { features })
      })
        .then(({ result, current }) => {
          if (cancelled) {
            return
          }
          actionsRef.current.publishDartScope(serverFilters, { result, current })
          setDartError(result.failure ? { message: result.failure.message } : null)
        })
        .catch(() => {
          if (!cancelled) {
            setDartError({ message: '' })
          }
        })
        .finally(() => {
          if (!cancelled) {
            setDartLoading(false)
          }
        })
      return () => {
        cancelled = true
      }
    }
    const rowsKey = JSON.stringify([hostKey, listKey, hasWorkspace, linkedRefsSignature])
    const listArgs = hasWorkspace ? null : buildDartListArgs(filters, viewerId)
    const readList = (forced: boolean): Promise<DartListOutcome> => {
      const request: Promise<DartListOutcome> = hasWorkspace
        ? readLinkedDartTasks(
            linkedRefs,
            (taskId, options) => actionsRef.current.fetchDartTask(taskId, options),
            sourceContext,
            forced
          ).then((linked) => ({
            tasks: linked.tasks,
            totalCount: linked.tasks.length,
            error: linked.error
          }))
        : listArgs === null
          ? Promise.resolve({ tasks: [], totalCount: 0, error: null })
          : actionsRef.current.listDartTasks(listArgs, { force: forced }).then((result) =>
              result.ok
                ? { tasks: result.tasks, totalCount: result.totalCount, error: null }
                : {
                    tasks: [],
                    totalCount: 0,
                    error: { message: taskProviderErrorMessage(result), code: result.errorCode }
                  }
            )
      return request.catch((): DartListOutcome => ({
        tasks: [],
        totalCount: 0,
        error: { message: '' }
      }))
    }
    void readPastDartWrites({
      captureEpoch: () => captureDartEpoch({ hostKey }),
      cancelled: () => cancelled,
      force,
      read: readList
    }).then(({ result, current }) => {
      if (cancelled) {
        return
      }
      setDartLoading(false)
      // Past the re-read limit the rows on screen stay, unless they answer another filter.
      if (!current && shownRowsKeyRef.current === rowsKey) {
        return
      }
      shownRowsKeyRef.current = rowsKey
      if (result.error && result.tasks.length === 0) {
        setDartTasks([])
        setDartTotalCount(0)
      } else {
        setDartTasks(withPendingDartPatches(result.tasks, { hostKey, accountKey }))
        setDartTotalCount(result.totalCount)
      }
      setDartError(result.error)
    })
    return () => {
      cancelled = true
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- Why: listKey/linkedRefsSignature fingerprint the filters and refs read here.
  }, [
    active,
    featuresReady,
    boardPath,
    listKey,
    hasWorkspace,
    linkedRefsSignature,
    refreshNonce,
    hostKey,
    accountKey
  ])

  return { dartLoading, dartError }
}
