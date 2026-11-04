import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  DartComment,
  DartCommentPage,
  DartTask,
  DartWorkspaceConfig
} from '../../../../../shared/dart/dart-types'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { taskProviderErrorMessage, taskProviderErrorText } from '@/lib/task-provider-error-copy'
import { runtimeTargetEnvironmentId } from '@/runtime/runtime-client-target'
import type { DartClientResult } from '@/runtime/runtime-dart-client'
import { dartSupportsWritesV2ForTarget } from '@/runtime/runtime-dart-write-client'
import { useAppStore } from '@/store'
import { getDartReadScope } from '@/store/slices/dart/dart-read-coordination'
import {
  captureDartEpoch,
  dartAccountIdentity,
  dartScopeViewerId,
  type DartEpochSnapshot
} from '@/store/slices/dart/dart-task-identity'
import { dartDraftKey } from './dart-draft-store'
import type { DartDetailCommentsApi, DartDetailDescriptionApi } from './dart-detail-contracts'
/* eslint-disable max-lines -- Why: task-detail read coordination and stale-read reconciliation must stay together to preserve task-switch ordering. */
import { readPastDartWrites, withLocalComments } from './dart-stale-read'
import { pendingDartPatches, subscribeDartTaskWrites } from './dart-task-write-queue'
import { getDartTaskOpenUrl } from './task-page-dart-list-model'
import type { DartCommentsView, DartDetailLoadState } from './TaskDetailView'
import { noOpenDartTaskFailure, useDartTaskDetailWrites } from './use-dart-task-detail-writes'

const LOADING_STATE = { status: 'loading' } as const

export function useDartTaskDetailData(
  task: DartTask | null,
  sourceContext: TaskSourceContext | null
) {
  const fetchDartTask = useAppStore((s) => s.fetchDartTask)
  const listDartComments = useAppStore((s) => s.listDartComments)
  const fetchDartConfig = useAppStore((s) => s.fetchDartConfig)
  const activeRuntimeEnvironmentId = useAppStore((s) => s.settings?.activeRuntimeEnvironmentId)
  const pageContextKey = useAppStore((s) => getProviderRuntimeContextKey(s.settings))
  const pageViewer = useAppStore((s) =>
    s.dartStatusContextKey === pageContextKey ? (s.dartStatus.viewer ?? null) : null
  )
  const [full, setFull] = useState<DartDetailLoadState<DartTask>>(LOADING_STATE)
  const [comments, setComments] = useState<DartDetailLoadState<DartCommentsView>>(LOADING_STATE)
  // Patches published while no read is on screen, so an edit shows over the opened row meanwhile.
  const [rowPatch, setRowPatch] = useState<{ taskId: string | null; patch: Partial<DartTask> }>({
    taskId: null,
    patch: {}
  })
  const rowPatchRef = useRef<Partial<DartTask>>({})
  const [config, setConfig] = useState<DartWorkspaceConfig | null>(null)
  const [supportsWritesV2, setSupportsWritesV2] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const taskId = task?.id ?? null
  const localCommentsRef = useRef<DartComment[]>([])
  const commentReadRef = useRef(0)
  const latestTaskReadRef = useRef(0)

  // The context key is a dep because its session generation decides whose status the default scope trusts.
  const scope = useMemo(
    () => getDartReadScope({ activeRuntimeEnvironmentId }, sourceContext),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- Why: see above.
    [activeRuntimeEnvironmentId, sourceContext, pageContextKey]
  )
  const viewerId = useAppStore((s) => dartScopeViewerId(s, scope, sourceContext))
  const { hostKey, accountKey } = dartAccountIdentity(scope, viewerId)
  // Generation-free strings, so a host session bump does not reopen the task.
  const identity = useMemo(
    () => (taskId ? { hostKey, accountKey, taskId } : null),
    [hostKey, accountKey, taskId]
  )
  // Environments, not context keys: an explicit scope's key is `<env>::<prefix>` and never equals the page's.
  const onPageEnvironment =
    runtimeTargetEnvironmentId(scope.target) ===
    runtimeTargetEnvironmentId(getDartReadScope({ activeRuntimeEnvironmentId }).target)
  const viewerName =
    pageViewer && onPageEnvironment && (!viewerId || viewerId === pageViewer.id)
      ? pageViewer.name
      : null

  useEffect(() => {
    rowPatchRef.current = {}
    localCommentsRef.current = []
    if (!identity) {
      return
    }
    const apply = (patch: Partial<DartTask>): void => {
      rowPatchRef.current = { ...rowPatchRef.current, ...patch }
      setRowPatch({ taskId: identity.taskId, patch: rowPatchRef.current })
      setFull((current) =>
        current.status === 'ready'
          ? { status: 'ready', value: { ...current.value, ...patch } }
          : current
      )
    }
    return subscribeDartTaskWrites(identity, (update) => apply(update.patch), apply)
  }, [identity])

  // The page-level config and capability belong to the default scope; the detail asks its own host.
  useEffect(() => {
    if (!identity) {
      return
    }
    let cancelled = false
    setConfig(null)
    setSupportsWritesV2(false)
    void fetchDartConfig({ sourceContext })
      .then((result) => {
        if (!cancelled && result.ok) {
          setConfig(result.config)
        }
      })
      .catch(() => {})
    void dartSupportsWritesV2ForTarget(scope.target).then((supported) => {
      if (!cancelled) {
        setSupportsWritesV2(supported)
      }
    })
    return () => {
      cancelled = true
    }
  }, [identity, scope, sourceContext, fetchDartConfig])

  const applyCommentsRead = useCallback(
    (result: DartClientResult<DartCommentPage>, current: boolean, reload: boolean) => {
      if (result.ok) {
        // Once Dart lists a comment its order wins; until then a just-added one must not vanish.
        localCommentsRef.current = localCommentsRef.current.filter(
          (local) => !result.comments.some((comment) => comment.id === local.id)
        )
      }
      setComments((shown) => {
        if (!current && shown.status === 'ready') {
          return shown
        }
        if (result.ok) {
          return {
            status: 'ready',
            value: withLocalComments(
              { comments: result.comments, totalCount: result.totalCount },
              localCommentsRef.current
            )
          }
        }
        // A failed reload must not hide the comments on screen.
        return reload && shown.status === 'ready'
          ? shown
          : { status: 'error', message: taskProviderErrorMessage(result) }
      })
    },
    []
  )

  // oxlint-disable-next-line react-doctor/no-derived-state-effect -- Why: this effect starts the reads; `loadedFor` records which task they answer.
  useEffect(() => {
    // The hook outlives a task switch, so a slow read of the last task must not land on this one.
    latestTaskReadRef.current += 1
    if (!taskId || !identity) {
      return
    }
    let cancelled = false
    const force = reloadNonce > 0
    const captureEpoch = (): DartEpochSnapshot => captureDartEpoch(identity)
    const isCancelled = (): boolean => cancelled
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
        if (cancelled) {
          return
        }
        // Past the re-read limit the edits on screen stay over the last read, since no read is shown yet.
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
        if (!cancelled) {
          setFull({
            status: 'error',
            message: taskProviderErrorText(undefined, 'dart.loadFailed')
          })
        }
      })
    commentReadRef.current += 1
    const commentRead = commentReadRef.current
    void readPastDartWrites({
      captureEpoch,
      cancelled: isCancelled,
      force,
      read: (forced) => listDartComments(taskId, { sourceContext, force: forced })
    })
      .then(({ result, current }) => {
        if (!cancelled && commentRead === commentReadRef.current) {
          applyCommentsRead(result, current, false)
        }
      })
      .catch(() => {
        if (!cancelled && commentRead === commentReadRef.current) {
          setComments({
            status: 'error',
            message: taskProviderErrorText(undefined, 'dart.loadFailed')
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [
    taskId,
    identity,
    sourceContext,
    reloadNonce,
    fetchDartTask,
    listDartComments,
    applyCommentsRead
  ])

  const retry = useCallback(() => setReloadNonce((n) => n + 1), [])
  // Until the effect runs for a newly opened task, the previous task's state must not show.
  const isCurrent = loadedFor === taskId
  const shownFull = isCurrent ? full : LOADING_STATE
  const shownComments = isCurrent ? comments : LOADING_STATE
  const displayed = useMemo(
    () =>
      shownFull.status === 'ready'
        ? shownFull.value
        : task
          ? { ...task, ...(rowPatch.taskId === task.id ? rowPatch.patch : {}) }
          : null,
    [shownFull, task, rowPatch]
  )
  const displayedRef = useRef(displayed)
  useEffect(() => {
    displayedRef.current = displayed
  })
  const writes = useDartTaskDetailWrites({ identity, sourceContext, displayedRef })

  const reloadComments = useCallback<DartDetailCommentsApi['reloadComments']>(async () => {
    if (!identity) return
    commentReadRef.current += 1
    const commentRead = commentReadRef.current
    const read = await readPastDartWrites({
      captureEpoch: () => captureDartEpoch(identity),
      force: true,
      read: () => listDartComments(identity.taskId, { sourceContext, force: true })
    }).catch(() => null)
    if (read && commentRead === commentReadRef.current) {
      applyCommentsRead(read.result, read.current, true)
      if (!read.result.ok) throw new Error(taskProviderErrorMessage(read.result))
      if (!read.current) throw new Error(taskProviderErrorText(undefined, 'dart.loadFailed'))
      return
    }
    throw new Error(taskProviderErrorText(undefined, 'dart.loadFailed'))
  }, [applyCommentsRead, identity, listDartComments, sourceContext])

  const appendLocalComment = useCallback<DartDetailCommentsApi['appendLocalComment']>((comment) => {
    if (!localCommentsRef.current.some((local) => local.id === comment.id)) {
      localCommentsRef.current = [...localCommentsRef.current, comment]
    }
    setComments((shown) =>
      shown.status === 'ready'
        ? { status: 'ready', value: withLocalComments(shown.value, [comment]) }
        : shown
    )
  }, [])

  const readLatestTask = useCallback<DartDetailDescriptionApi['readLatestTask']>(async () => {
    if (!identity) {
      return noOpenDartTaskFailure()
    }
    const latestTaskRead = ++latestTaskReadRef.current
    const { result, current } = await readPastDartWrites({
      captureEpoch: () => captureDartEpoch(identity),
      force: true,
      read: () => fetchDartTask(identity.taskId, { sourceContext, force: true })
    })
    if (result.ok && current && latestTaskRead === latestTaskReadRef.current) {
      const latest = { ...result.task, ...pendingDartPatches(identity) }
      setFull((shown) => (shown.status === 'ready' ? { status: 'ready', value: latest } : shown))
    }
    return result
  }, [fetchDartTask, identity, sourceContext])

  const description: DartDetailLoadState<string> =
    shownFull.status === 'ready'
      ? { status: 'ready', value: shownFull.value.description ?? '' }
      : shownFull.status === 'error'
        ? shownFull
        : LOADING_STATE

  return {
    ...writes,
    full: shownFull,
    comments: shownComments,
    retry,
    task: displayed,
    openUrl: displayed ? getDartTaskOpenUrl(displayed) : null,
    config,
    supportsWritesV2,
    viewerName,
    writeScope: sourceContext,
    reloadComments,
    appendLocalComment,
    commentDraftKey: identity ? dartDraftKey(identity, identity.taskId, 'comment') : null,
    description,
    readLatestTask,
    descriptionDraftKey: identity ? dartDraftKey(identity, identity.taskId, 'description') : null
  }
}
