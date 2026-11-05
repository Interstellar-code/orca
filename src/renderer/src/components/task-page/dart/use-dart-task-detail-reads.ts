import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react'
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
  commentReadsRef: RefObject<Map<string, number>>
  taskIdRef: RefObject<string | null>
  setLoadedFor: Dispatch<SetStateAction<string | null>>
}

export function identityMatches(a: Identity | null, b: Identity | null): boolean {
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
  commentReadsRef,
  taskIdRef,
  setLoadedFor
}: Options): void {
  const loadedScopeRef = useRef<string | null>(null)
  useEffect(() => {
    identityRef.current = identity
    taskIdRef.current = taskId
    const thisRead = { taskId, identity }
    const commentReadKey = identity
      ? JSON.stringify([identity.hostKey, identity.accountKey, identity.taskId])
      : null
    // Sequence by full read scope, so a task reload cannot invalidate another task.
    if (commentReadKey) {
      const reads = commentReadsRef.current
      reads.set(commentReadKey, (reads.get(commentReadKey) ?? 0) + 1)
    }
    const taskRead = ++latestTaskReadRef.current
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
    const scopeKey = JSON.stringify([identity.hostKey, identity.accountKey, identity.taskId])
    if (loadedScopeRef.current !== scopeKey) {
      loadedScopeRef.current = scopeKey
      setFull(LOADING_STATE)
      setComments(LOADING_STATE)
    }
    setLoadedFor(scopeKey)
    void readPastDartWrites({
      captureEpoch,
      cancelled: isCancelled,
      force,
      read: (forced) => fetchDartTask(taskId, { sourceContext, force: forced })
    })
      .then(({ result, current }) => {
        if (cancelled || taskRead !== latestTaskReadRef.current || !isCurrentRead()) {
          return
        }
        if (result.ok) {
          setFull({
            status: 'ready',
            value: {
              ...result.task,
              ...(current ? {} : rowPatchRef.current),
              ...pendingDartPatches(identity)
            }
          })
        } else {
          setFull((shown) =>
            shown.status === 'ready'
              ? shown
              : { status: 'error', message: taskProviderErrorMessage(result) }
          )
        }
      })
      .catch(() => {
        if (!cancelled && taskRead === latestTaskReadRef.current && isCurrentRead()) {
          setFull((shown) =>
            shown.status === 'ready'
              ? shown
              : {
                  status: 'error',
                  message: taskProviderErrorText(undefined, 'dart.loadFailed')
                }
          )
        }
      })
    const commentRead = commentReadKey ? commentReadsRef.current.get(commentReadKey) : null
    void readPastDartWrites({
      captureEpoch,
      cancelled: isCancelled,
      force,
      read: (forced) => listDartComments(taskId, { sourceContext, force: forced })
    })
      .then(({ result, current }) => {
        if (
          !cancelled &&
          commentReadKey !== null &&
          commentRead === commentReadsRef.current.get(commentReadKey) &&
          isCurrentRead()
        ) {
          applyCommentsRead(result, current, false)
        }
      })
      .catch(() => {
        if (
          !cancelled &&
          commentReadKey !== null &&
          commentRead === commentReadsRef.current.get(commentReadKey) &&
          isCurrentRead()
        ) {
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
    commentReadsRef,
    taskIdRef,
    setLoadedFor
  ])
}
