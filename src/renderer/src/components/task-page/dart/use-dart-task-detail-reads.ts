import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type { DartCommentPage, DartTask } from '../../../../../shared/dart/dart-types'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import { taskProviderErrorMessage, taskProviderErrorText } from '@/lib/task-provider-error-copy'
import type { DartClientResult } from '@/runtime/runtime-dart-client'
import { captureDartEpoch, type DartEpochSnapshot } from '@/store/slices/dart/dart-task-identity'
import { readPastDartWrites } from './dart-stale-read'
import { pendingDartPatches } from './dart-task-write-queue'
import type { DartCommentsView, DartDetailLoadState } from './TaskDetailView'
const LOADING_STATE = { status: 'loading' } as const

type Identity = { hostKey: string; accountKey: string; taskId: string }
type Options = {
  taskId: string | null
  identity: Identity | null
  sourceContext: TaskSourceContext | null
  reloadNonce: number
  fetchDartTask: (
    taskId: string,
    options: { sourceContext: TaskSourceContext | null; force: boolean }
  ) => Promise<DartClientResult<{ task: DartTask }>>
  listDartComments: (
    taskId: string,
    options: { sourceContext: TaskSourceContext | null; force: boolean }
  ) => Promise<DartClientResult<DartCommentPage>>
  setFull: Dispatch<SetStateAction<DartDetailLoadState<DartTask>>>
  setComments: Dispatch<SetStateAction<DartDetailLoadState<DartCommentsView>>>
  applyCommentsRead: (
    result: DartClientResult<DartCommentPage>,
    current: boolean,
    reload: boolean
  ) => void
  identityRef: RefObject<Identity | null>
  rowPatchRef: RefObject<Partial<DartTask>>
  latestTaskReadRef: RefObject<number>
  commentReadRef: RefObject<number>
  taskIdRef: RefObject<string | null>
  setLoadedFor: Dispatch<SetStateAction<string | null>>
}

function identityMatches(a: Identity | null, b: Identity | null): boolean {
  if (a === null || b === null) {
    return false
  }
  return a.hostKey === b.hostKey && a.accountKey === b.accountKey && a.taskId === b.taskId
}

export function useDartTaskDetailReads({
  taskId,
  identity,
  sourceContext,
  reloadNonce,
  fetchDartTask,
  listDartComments,
  setFull,
  setComments,
  applyCommentsRead,
  identityRef,
  rowPatchRef,
  latestTaskReadRef,
  commentReadRef,
  taskIdRef,
  setLoadedFor
}: Options): void {
  useEffect(() => {
    identityRef.current = identity
    taskIdRef.current = taskId
    const thisRead = { taskId, identity }
    // Per-task read sequencing: a reload or switch for task A must never cancel task B's first read.
    if (taskId) {
      commentReadRef.current += 1
    }
    latestTaskReadRef.current += 1
    if (!taskId || !identity) {
      return
    }
    let cancelled = false
    const force = reloadNonce > 0
    const captureEpoch = (): DartEpochSnapshot => captureDartEpoch(identity)
    const isCancelled = (): boolean => cancelled
    const isCurrentRead = (): boolean =>
      identityRef.current !== null &&
      identityMatches(identityRef.current, thisRead.identity) &&
      taskIdRef.current === thisRead.taskId
    setLoadedFor(taskId)
    setFull(LOADING_STATE)
    setComments(LOADING_STATE)
    void readPastDartWrites({
      captureEpoch,
      cancelled: isCancelled,
      force,
      read: (forced) => fetchDartTask(taskId, { sourceContext, force: forced })
    })
      .then(({ result, current }) => {
        if (cancelled || !isCurrentRead()) {
          return
        }
        setFull(
          result.ok
            ? {
                status: 'ready',
                value: {
                  ...result.task,
                  ...(current ? {} : rowPatchRef.current),
                  ...pendingDartPatches(identity)
                }
              }
            : { status: 'error', message: taskProviderErrorMessage(result) }
        )
      })
      .catch(() => {
        if (!cancelled && isCurrentRead()) {
          setFull({
            status: 'error',
            message: taskProviderErrorText(undefined, 'dart.loadFailed')
          })
        }
      })
    const commentRead = commentReadRef.current
    void readPastDartWrites({
      captureEpoch,
      cancelled: isCancelled,
      force,
      read: (forced) => listDartComments(taskId, { sourceContext, force: forced })
    })
      .then(({ result, current }) => {
        if (!cancelled && commentRead === commentReadRef.current && isCurrentRead()) {
          applyCommentsRead(result, current, false)
        }
      })
      .catch(() => {
        if (!cancelled && commentRead === commentReadRef.current && isCurrentRead()) {
          setComments({
            status: 'error',
            message: taskProviderErrorText(undefined, 'dart.loadFailed')
          })
        }
      })
    return () => {
      cancelled = true
      identityRef.current = null
      taskIdRef.current = null
    }
  }, [
    taskId,
    identity,
    sourceContext,
    reloadNonce,
    fetchDartTask,
    listDartComments,
    applyCommentsRead,
    setFull,
    setComments,
    identityRef,
    rowPatchRef,
    latestTaskReadRef,
    commentReadRef,
    taskIdRef,
    setLoadedFor
  ])
}
