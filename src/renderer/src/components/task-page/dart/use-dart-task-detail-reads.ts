import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction
} from 'react'
import type {
  DartComment,
  DartCommentPage,
  DartTask,
  DartUser,
  DartWorkspaceConfig
} from '../../../../../shared/dart/dart-types'
import type { RuntimeClientTarget } from '../../../../../shared/runtime-client-target'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import { taskProviderErrorMessage, taskProviderErrorText } from '@/lib/task-provider-error-copy'
import { dartStatusForTarget, type DartClientResult } from '@/runtime/runtime-dart-client'
import { dartSupportsWritesV2ForTarget } from '@/runtime/runtime-dart-write-client'
import { useAppStore } from '@/store'
import type { DartReadScope } from '@/store/slices/dart/dart-read-coordination'
import { captureDartEpoch, type DartEpochSnapshot } from '@/store/slices/dart/dart-task-identity'
import { readPastDartWrites, withLocalComments } from './dart-stale-read'
import { readAllDartComments } from './dart-comment-reload'
import { pendingDartPatches } from './dart-task-write-queue'
import type { DartCommentsView, DartDetailLoadState } from './TaskDetailView'
const LOADING_STATE = { status: 'loading' } as const

type Identity = { hostKey: string; accountKey: string; taskId: string }
export function useDartCommentsRead(
  localCommentsRef: RefObject<DartComment[]>,
  setComments: Dispatch<SetStateAction<DartDetailLoadState<DartCommentsView>>>
) {
  const applyCommentsRead = useCallback(
    (result: DartClientResult<DartCommentPage>, current: boolean, reload: boolean) => {
      if (!current) {
        setComments((shown) =>
          shown.status === 'ready'
            ? shown
            : { status: 'error', message: taskProviderErrorText(undefined, 'dart.loadFailed') }
        )
        return
      }
      if (result.ok) {
        // Once Dart lists a comment its order wins; until then a just-added one must not vanish.
        localCommentsRef.current = localCommentsRef.current.filter(
          (local) => !result.comments.some((comment) => comment.id === local.id)
        )
      }
      setComments((shown) => {
        if (result.ok) {
          return {
            status: 'ready',
            value: withLocalComments(
              { comments: result.comments, totalCount: result.totalCount },
              localCommentsRef.current
            )
          }
        }
        return reload && shown.status === 'ready'
          ? shown
          : { status: 'error', message: taskProviderErrorMessage(result) }
      })
    },
    [localCommentsRef, setComments]
  )
  return applyCommentsRead
}
export function useDartDetailMetadata(
  identity: Identity | null,
  scope: DartReadScope,
  sourceContext: TaskSourceContext | null,
  viewerScope: string,
  reloadNonce: number
) {
  const fetchDartConfig = useAppStore((s) => s.fetchDartConfig)
  const [config, setConfig] = useState<DartWorkspaceConfig | null>(null)
  const [configFailed, setConfigFailed] = useState(false)
  const [supportsWritesV2, setSupportsWritesV2] = useState(false)
  const [detailViewer, setDetailViewer] = useState<{
    scope: string
    viewer: DartUser | null
  } | null>(null)
  useEffect(() => {
    if (!identity) {
      return
    }
    let cancelled = false
    setConfig(null)
    setConfigFailed(false)
    setSupportsWritesV2(false)
    setDetailViewer(null)
    void dartStatusForTarget(scope.target)
      .then((status) => {
        if (!cancelled) {
          setDetailViewer({ scope: viewerScope, viewer: status.viewer ?? null })
        }
      })
      .catch(() => {})
    void fetchDartConfig({ sourceContext })
      .then((result) => {
        if (!cancelled) {
          setConfigFailed(!result.ok)
          if (result.ok) {
            setConfig(result.config)
          }
        }
      })
      .catch(() => !cancelled && setConfigFailed(true))
    void dartSupportsWritesV2ForTarget(scope.target).then((supported) => {
      if (!cancelled) {
        setSupportsWritesV2(supported)
      }
    })
    return () => {
      cancelled = true
    }
  }, [identity, scope, sourceContext, fetchDartConfig, viewerScope, reloadNonce])
  return { config, configFailed, supportsWritesV2, detailViewer }
}

type Options = {
  taskId: string | null
  identity: Identity | null
  sourceContext: TaskSourceContext | null
  reloadNonce: number
  target: RuntimeClientTarget
  fetchDartTask: (
    taskId: string,
    options: { sourceContext: TaskSourceContext | null; force: boolean }
  ) => Promise<DartClientResult<{ task: DartTask }>>
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
  target,
  fetchDartTask,
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
      read: () => readAllDartComments(target, taskId)
    })
      .then(({ result, current }) => {
        if (
          !cancelled &&
          commentReadKey !== null &&
          commentRead === commentReadsRef.current.get(commentReadKey) &&
          isCurrentRead()
        ) {
          applyCommentsRead(result, current, true)
        }
      })
      .catch(() => {
        if (
          !cancelled &&
          commentReadKey !== null &&
          commentRead === commentReadsRef.current.get(commentReadKey) &&
          isCurrentRead()
        ) {
          setComments((shown) =>
            shown.status === 'ready'
              ? shown
              : {
                  status: 'error',
                  message: taskProviderErrorText(undefined, 'dart.loadFailed')
                }
          )
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
    target,
    fetchDartTask,
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
