import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DartTask, DartTaskRelationships } from '../../../../../shared/dart/dart-types'
import { translate } from '@/i18n/i18n'
import { taskProviderErrorMessage, taskProviderErrorText } from '@/lib/task-provider-error-copy'
import type { DartWriteFailure } from '@/runtime/runtime-dart-write-client'
import { useAppStore } from '@/store'
import { getDartReadScope } from '@/store/slices/dart/dart-read-coordination'
import {
  captureDartEpoch,
  dartAccountIdentity,
  dartScopeViewerId,
  dartTaskIdentityKey,
  registerDartCacheAlias,
  type DartTaskIdentity
} from '@/store/slices/dart/dart-task-identity'
import type {
  DartRelationshipsApi,
  DartRelationshipState,
  UseDartTaskRelationships
} from './dart-board-contracts'
import type { DartNoticeApi } from './dart-detail-contracts'
import { readPastDartWrites } from './dart-stale-read'
import {
  dismissDartTaskNotice,
  enqueueDartTaskWrite,
  pendingDartPatches,
  recheckDartTaskNotice,
  subscribeDartTaskWrites
} from './dart-task-write-queue'
import { writeDartRelationshipCache } from './dart-relationship-cache-write'
import { useDartHostFeatures } from './use-dart-host-features'
import { useDartRelatedTasks } from './use-dart-related-tasks'
import { noOpenDartTaskFailure, useDartTaskWriteState } from './use-dart-task-detail-writes'

type RelationshipsRead = {
  key: string
  state: 'known' | 'notChecked' | 'error'
  relationships: DartTaskRelationships | null
  error: string | null
}

function missingLinksFailure(): DartWriteFailure {
  return {
    ok: false,
    outcome: 'notApplied',
    error: translate(
      'auto.components.task.page.dart.use-dart-task-relationships.noLinks',
      "Dart did not return this task's links"
    )
  }
}

export const useDartTaskRelationships: UseDartTaskRelationships = ({ task, sourceContext }) => {
  const activeEnvironmentId = useAppStore((s) => s.settings?.activeRuntimeEnvironmentId ?? null)
  const scope = useMemo(
    () => getDartReadScope({ activeRuntimeEnvironmentId: activeEnvironmentId }, sourceContext),
    [activeEnvironmentId, sourceContext]
  )
  const viewerId = useAppStore((s) => dartScopeViewerId(s, scope, sourceContext))
  const { hostKey, accountKey } = dartAccountIdentity(scope, viewerId)
  useEffect(() => registerDartCacheAlias(scope, viewerId), [scope, viewerId])
  const taskId = task?.id ?? null
  // Generation-free strings, so a host session bump does not reopen the task.
  const identity = useMemo<DartTaskIdentity | null>(
    () => (taskId ? { hostKey, accountKey, taskId } : null),
    [hostKey, accountKey, taskId]
  )
  const identityKey = identity ? dartTaskIdentityKey(identity) : null

  const fetchDartTask = useAppStore((s) => s.fetchDartTask)
  const patchDartTask = useAppStore((s) => s.patchDartTask)
  const invalidateDartLists = useAppStore((s) => s.invalidateDartLists)
  const setDartTaskBlockers = useAppStore((s) => s.setDartTaskBlockers)
  const searchDartTasks = useAppStore((s) => s.searchDartTasks)

  const { hostFeatures } = useDartHostFeatures({
    active: identity !== null,
    hostKey,
    target: scope.target
  })
  const relationshipsHost = identity !== null && hostFeatures?.relationships === true

  const [read, setRead] = useState<RelationshipsRead | null>(null)
  const [readNonce, setReadNonce] = useState(0)

  useEffect(() => {
    if (!identity || !identityKey || !relationshipsHost) {
      return
    }
    let cancelled = false
    const settle = (next: Omit<RelationshipsRead, 'key'>): void => {
      if (!cancelled) {
        setRead((shown) =>
          next.state === 'error' && shown?.key === identityKey && shown.state === 'known'
            ? shown
            : { key: identityKey, ...next }
        )
      }
    }
    readPastDartWrites({
      captureEpoch: () => captureDartEpoch(identity),
      cancelled: () => cancelled,
      force: true,
      read: (forced) => fetchDartTask(identity.taskId, { sourceContext, scope, force: forced })
    })
      .then(({ result }) => {
        if (cancelled) {
          return
        }
        if (!result.ok) {
          settle({ state: 'error', relationships: null, error: taskProviderErrorMessage(result) })
          return
        }
        // An optimistic edit still in the queue stays over the server's copy.
        const { relationships } = { ...result.task, ...pendingDartPatches(identity) }
        writeDartRelationshipCache(identity, relationships)
        settle({
          state: relationships ? 'known' : 'notChecked',
          relationships: relationships ?? null,
          error: null
        })
      })
      .catch(() =>
        settle({
          state: 'error',
          relationships: null,
          error: taskProviderErrorText(undefined, 'dart.loadFailed')
        })
      )
    return () => {
      cancelled = true
    }
  }, [identity, identityKey, relationshipsHost, sourceContext, scope, fetchDartTask, readNonce])

  // Queue updates (optimistic, rollback, confirmed, evidence) reach the shown relationships and the cache.
  useEffect(() => {
    if (!identity || !identityKey || !relationshipsHost) {
      return
    }
    const apply = (patch: Partial<DartTask>): void => {
      if (!('relationships' in patch)) {
        return
      }
      writeDartRelationshipCache(identity, patch.relationships)
      setRead({
        key: identityKey,
        state: patch.relationships ? 'known' : 'notChecked',
        relationships: patch.relationships ?? null,
        error: null
      })
    }
    return subscribeDartTaskWrites(identity, (update) => apply(update.patch), apply)
  }, [identity, identityKey, relationshipsHost])

  const shown = read?.key === identityKey ? read : null
  const state: DartRelationshipState = shown?.state ?? 'loading'
  const relationships = shown?.state === 'known' ? shown.relationships : null

  const retryRead = useCallback(() => setReadNonce((n) => n + 1), [])
  const { parent, blockers, blocking, subtasks } = useDartRelatedTasks({
    taskKey: identityKey,
    parentId: relationshipsHost ? task?.parentId : null,
    relationships,
    linksFailed: state === 'error',
    retryLinks: retryRead,
    sourceContext,
    scope
  })

  const writeState = useDartTaskWriteState(identity)
  const noticeApi = useMemo<DartNoticeApi>(() => {
    const notice = writeState.notice
    return {
      // Task-wide in the queue; the Blocked by section shows only its own.
      notice: notice?.field === 'relationships' ? notice : null,
      dismissNotice: () => {
        if (identity) {
          dismissDartTaskNotice(identity)
        }
      },
      recheckNotice: () => (identity ? recheckDartTaskNotice(identity) : Promise.resolve())
    }
  }, [writeState.notice, identity])

  const shownTask = useMemo<DartTask | null>(
    () => (task ? { ...task, ...(relationships ? { relationships } : {}) } : null),
    [task, relationships]
  )
  const shownTaskRef = useRef(shownTask)
  shownTaskRef.current = shownTask

  const onSetBlockers = useCallback<DartRelationshipsApi['onSetBlockers']>(
    async (ids) => {
      const previous = shownTaskRef.current
      if (!identity || !previous) {
        return noOpenDartTaskFailure()
      }
      if (!previous.relationships) {
        return missingLinksFailure()
      }
      const blockerIds = [...ids]
      return enqueueDartTaskWrite({
        identity,
        previous,
        optimistic: { relationships: { ...previous.relationships, blockerIds } },
        fields: ['relationships'],
        write: () => setDartTaskBlockers(identity.taskId, blockerIds, { sourceContext, scope }),
        refresh: () => fetchDartTask(identity.taskId, { sourceContext, scope, force: true }),
        patch: (patch) => {
          patchDartTask(identity, patch)
          // patchDartTask leaves the relationship cache alone, and this runs after the detail has closed.
          if ('relationships' in patch) {
            writeDartRelationshipCache(identity, patch.relationships)
          }
        },
        invalidateLists: () => invalidateDartLists(identity)
      })
    },
    [
      identity,
      sourceContext,
      scope,
      setDartTaskBlockers,
      fetchDartTask,
      patchDartTask,
      invalidateDartLists
    ]
  )

  const dartboard = task?.dartboard
  const searchTasks = useCallback<DartRelationshipsApi['searchTasks']>(
    (text, options) =>
      searchDartTasks(text, {
        sourceContext,
        ...(options?.thisDartboardOnly && dartboard ? { dartboard } : {})
      }),
    [searchDartTasks, sourceContext, dartboard]
  )

  return useMemo<DartRelationshipsApi | undefined>(
    () =>
      relationshipsHost && shownTask
        ? {
            task: shownTask,
            state,
            parent,
            blockers,
            blocking,
            subtasks,
            pending: writeState.pendingFields.has('relationships'),
            blocked: writeState.blockedFields.has('relationships'),
            notice: noticeApi,
            onSetBlockers,
            searchTasks
          }
        : undefined,
    [
      relationshipsHost,
      shownTask,
      state,
      parent,
      blockers,
      blocking,
      subtasks,
      writeState,
      noticeApi,
      onSetBlockers,
      searchTasks
    ]
  )
}
