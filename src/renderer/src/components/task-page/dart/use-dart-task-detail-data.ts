import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DartComment, DartTask } from '../../../../../shared/dart/dart-types'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import { taskProviderErrorMessage, taskProviderErrorText } from '@/lib/task-provider-error-copy'
import { runtimeTargetEnvironmentId } from '@/runtime/runtime-client-target'
import { useAppStore } from '@/store'
import {
  dartExplicitScope,
  dartPageScopeFromContextKey
} from '@/store/slices/dart/dart-read-coordination'
import {
  captureDartEpoch,
  dartAccountIdentity,
  dartScopeViewerId,
  isDartEpochCurrent
} from '@/store/slices/dart/dart-task-identity'
import { dartDraftKey } from './dart-draft-store'
import { readAllDartComments, reloadDartComments } from './dart-comment-reload'
import type { DartDetailCommentsApi, DartDetailDescriptionApi } from './dart-detail-contracts'
import { readPastDartWrites, withLocalComments } from './dart-stale-read'
import { pendingDartPatches, subscribeDartTaskWrites } from './dart-task-write-queue'
import { getDartTaskOpenUrl } from './task-page-dart-list-model'
import type { DartCommentsView, DartDetailLoadState } from './TaskDetailView'
import { noOpenDartTaskFailure, useDartTaskDetailWrites } from './use-dart-task-detail-writes'
import {
  identityMatches,
  useDartCommentsRead,
  useDartDetailMetadata,
  useDartTaskDetailReads
} from './use-dart-task-detail-reads'

const LOADING_STATE = { status: 'loading' } as const

export function useDartTaskDetailData(
  task: DartTask | null,
  sourceContext: TaskSourceContext | null,
  pageContextKey: string
) {
  const fetchDartTask = useAppStore((s) => s.fetchDartTask)
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
  const [reloadNonce, setReloadNonce] = useState(0)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const taskId = task?.id ?? null
  const localCommentsRef = useRef<DartComment[]>([])
  const commentReadsRef = useRef(new Map<string, number>())
  const latestTaskReadRef = useRef(0)
  const taskIdRef = useRef<string | null>(null)

  const pageScope = useMemo(() => dartPageScopeFromContextKey(pageContextKey), [pageContextKey])
  const scope = useMemo(
    () => (sourceContext ? dartExplicitScope(sourceContext) : pageScope),
    [sourceContext, pageScope]
  )
  const viewerId = useAppStore((s) => dartScopeViewerId(s, scope, sourceContext))
  const { hostKey, accountKey } = dartAccountIdentity(scope, viewerId)
  // Generation-free strings, so a host session bump does not reopen the task.
  const identity = useMemo(
    () => (taskId ? { hostKey, accountKey, taskId } : null),
    [hostKey, accountKey, taskId]
  )
  const identityRef = useRef(identity)
  identityRef.current = identity
  // Environments, not context keys: an explicit scope's key is `<env>::<prefix>` and never equals the page's.
  const onPageEnvironment =
    runtimeTargetEnvironmentId(scope.target) === runtimeTargetEnvironmentId(pageScope.target)
  const viewerScope = JSON.stringify([hostKey, accountKey])
  const { config, configFailed, supportsWritesV2, detailViewer } = useDartDetailMetadata(
    identity,
    scope,
    sourceContext,
    viewerScope,
    reloadNonce
  )
  const scopedViewer = detailViewer?.scope === viewerScope ? detailViewer.viewer : null
  const viewer =
    scopedViewer && (!viewerId || viewerId === scopedViewer.id)
      ? scopedViewer
      : pageViewer && onPageEnvironment && (!viewerId || viewerId === pageViewer.id)
        ? pageViewer
        : null
  const viewerName = viewer?.name ?? null
  const viewerEmail = viewer?.email ?? null

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

  const applyCommentsRead = useDartCommentsRead(localCommentsRef, setComments)

  useDartTaskDetailReads({
    taskId,
    identity,
    sourceContext,
    reloadNonce,
    fetchDartTask,
    target: scope.target,
    setFull,
    setComments,
    applyCommentsRead,
    identityRef,
    rowPatchRef,
    latestTaskReadRef,
    commentReadsRef,
    taskIdRef,
    setLoadedFor
  })

  const retry = useCallback(() => setReloadNonce((n) => n + 1), [])
  // Until the effect runs for a newly opened task, the previous task's state must not show.
  const isCurrent =
    loadedFor ===
    (identity ? JSON.stringify([identity.hostKey, identity.accountKey, identity.taskId]) : null)
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

  const commentReadKey = identity
    ? JSON.stringify([identity.hostKey, identity.accountKey, identity.taskId])
    : null

  const reloadComments = useCallback<DartDetailCommentsApi['reloadComments']>(async () => {
    if (!commentReadKey || !identity || !identityMatches(identityRef.current, identity)) {
      return
    }
    const reads = commentReadsRef.current
    const nextRead = (reads.get(commentReadKey) ?? 0) + 1
    reads.set(commentReadKey, nextRead)
    await reloadDartComments({
      identity,
      target: scope.target,
      onError: () =>
        setComments((shown) =>
          shown.status === 'ready'
            ? shown
            : { status: 'error', message: taskProviderErrorText(undefined, 'dart.loadFailed') }
        ),
      isLatestRead: () =>
        identityMatches(identityRef.current, identity) && reads.get(commentReadKey) === nextRead,
      applyCommentsRead
    })
  }, [applyCommentsRead, commentReadKey, identity, scope.target])
  const readLatestComments = useCallback(async (): Promise<DartComment[]> => {
    if (!commentReadKey || !identity || !identityMatches(identityRef.current, identity)) {
      throw new Error(taskProviderErrorText(undefined, 'dart.loadFailed'))
    }
    const reads = commentReadsRef.current
    const nextRead = (reads.get(commentReadKey) ?? 0) + 1
    reads.set(commentReadKey, nextRead)
    const isLatestCommentRead = (): boolean =>
      identityMatches(identityRef.current, identity) && reads.get(commentReadKey) === nextRead
    const setCommentReadError = (): void => {
      if (isLatestCommentRead()) {
        setComments((shown) =>
          shown.status === 'ready'
            ? shown
            : { status: 'error', message: taskProviderErrorText(undefined, 'dart.loadFailed') }
        )
      }
    }
    const capturedEpoch = captureDartEpoch(identity)
    const { result, current } = await readPastDartWrites({
      captureEpoch: () => captureDartEpoch(identity),
      force: true,
      read: () => readAllDartComments(scope.target, identity.taskId)
    }).catch((error: unknown) => {
      setCommentReadError()
      throw error
    })
    if (!current) {
      setCommentReadError()
    }
    if (!isLatestCommentRead() || !current || !isDartEpochCurrent(capturedEpoch)) {
      setCommentReadError()
      throw new Error(taskProviderErrorText(undefined, 'dart.loadFailed'))
    }
    if (!result.ok) {
      setCommentReadError()
      throw new Error(taskProviderErrorMessage(result))
    }
    if (result.rawCount !== undefined && result.rawCount !== result.comments.length) {
      setCommentReadError()
      throw new Error(taskProviderErrorText(undefined, 'dart.loadFailed'))
    }
    applyCommentsRead(result, true, true)
    return [...withLocalComments(result, localCommentsRef.current).comments]
  }, [applyCommentsRead, commentReadKey, identity, scope.target])
  const appendLocalComment = useCallback<DartDetailCommentsApi['appendLocalComment']>(
    (comment) => {
      if (!identity) {
        return
      }
      if (!identityMatches(identityRef.current, identity) || comment.taskId !== identity.taskId) {
        return
      }
      if (!localCommentsRef.current.some((local) => local.id === comment.id)) {
        localCommentsRef.current = [...localCommentsRef.current, comment]
      }
      setComments((shown) =>
        shown.status === 'ready'
          ? { status: 'ready', value: withLocalComments(shown.value, [comment]) }
          : shown
      )
    },
    [identity]
  )
  const readLatestTask = useCallback<DartDetailDescriptionApi['readLatestTask']>(async () => {
    if (!identity) {
      return noOpenDartTaskFailure()
    }
    if (!identityMatches(identityRef.current, identity)) {
      return noOpenDartTaskFailure()
    }
    const latestTaskRead = ++latestTaskReadRef.current
    const { result, current } = await readPastDartWrites({
      captureEpoch: () => captureDartEpoch(identity),
      force: true,
      read: () => fetchDartTask(identity.taskId, { sourceContext, force: true })
    })
    if (
      result.ok &&
      current &&
      identityMatches(identityRef.current, identity) &&
      latestTaskRead === latestTaskReadRef.current
    ) {
      const latest = { ...result.task, ...pendingDartPatches(identity) }
      setFull({ status: 'ready', value: latest })
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
    configFailed,
    supportsWritesV2,
    viewerName,
    viewerEmail,
    writeScope: sourceContext,
    reloadComments,
    readLatestComments,
    appendLocalComment,
    commentDraftKey: identity ? dartDraftKey(identity, identity.taskId, 'comment') : null,
    description,
    readLatestTask,
    descriptionDraftKey: identity ? dartDraftKey(identity, identity.taskId, 'description') : null
  }
}
