import { useCallback, useRef, useSyncExternalStore, type RefObject } from 'react'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import { translate } from '@/i18n/i18n'
import type { DartWriteFailure, DartWriteResult } from '@/runtime/runtime-dart-write-client'
import { useAppStore } from '@/store'
import type { DartTaskIdentity } from '@/store/slices/dart/dart-task-identity'
import type {
  DartDetailCommentsApi,
  DartDetailDescriptionApi,
  DartDetailEditApi,
  DartNoticeApi
} from './dart-detail-contracts'
import {
  dartTaskWriteState,
  dismissDartTaskNotice,
  enqueueDartTaskWrite,
  recheckDartTaskNotice,
  subscribeDartTaskWrites,
  type DartTaskWriteState
} from './dart-task-write-queue'
import { editedFields, type EditableDartTaskField } from './dart-task-write-state'

const NO_FIELDS: ReadonlySet<string> = new Set()
const NO_WRITES: DartTaskWriteState = {
  pendingFields: NO_FIELDS,
  blockedFields: NO_FIELDS,
  notice: null
}

export function noOpenDartTaskFailure(): DartWriteFailure {
  return {
    ok: false,
    outcome: 'notApplied',
    error: translate(
      'auto.components.task.page.dart.TaskDetail.noOpenTask',
      'No Dart task is open.'
    )
  }
}

// The queue builds a new state object per call, so one object is cached per change for the external store.
function useDartTaskWriteState(identity: DartTaskIdentity | null): DartTaskWriteState {
  const cache = useRef<{ identity: DartTaskIdentity | null; state: DartTaskWriteState }>({
    identity: null,
    state: NO_WRITES
  })
  const read = useCallback(() => {
    cache.current = { identity, state: identity ? dartTaskWriteState(identity) : NO_WRITES }
  }, [identity])
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!identity) {
        return () => {}
      }
      // A write may have started between render and this subscription.
      read()
      return subscribeDartTaskWrites(
        identity,
        () => {
          read()
          onChange()
        },
        () => {}
      )
    },
    [identity, read]
  )
  const snapshot = useCallback(() => {
    if (cache.current.identity !== identity) {
      read()
    }
    return cache.current.state
  }, [identity, read])
  return useSyncExternalStore(subscribe, snapshot)
}

/** Every detail write, in the detail's own scope. `displayedRef` is what the user sees, which the queue needs as `previous`. */
export function useDartTaskDetailWrites(args: {
  identity: DartTaskIdentity | null
  sourceContext: TaskSourceContext | null
  displayedRef: RefObject<DartTask | null>
}) {
  const { identity, sourceContext, displayedRef } = args
  const fetchDartTask = useAppStore((s) => s.fetchDartTask)
  const updateDartTask = useAppStore((s) => s.updateDartTask)
  const updateDartTaskDescription = useAppStore((s) => s.updateDartTaskDescription)
  const addDartComment = useAppStore((s) => s.addDartComment)
  const patchDartTask = useAppStore((s) => s.patchDartTask)
  const invalidateDartLists = useAppStore((s) => s.invalidateDartLists)
  const closeGuardsRef = useRef(new Set<() => boolean | Promise<boolean>>())
  const writeState = useDartTaskWriteState(identity)

  const enqueueWrite = useCallback(
    (
      optimistic: Partial<DartTask>,
      fields: readonly EditableDartTaskField[],
      write: (taskId: string) => Promise<DartWriteResult<{ task: DartTask }>>
    ): Promise<DartWriteResult<{ task: DartTask }>> => {
      const previous = displayedRef.current
      if (!identity || !previous) {
        return Promise.resolve(noOpenDartTaskFailure())
      }
      return enqueueDartTaskWrite({
        identity,
        previous,
        optimistic,
        fields,
        write: () => write(identity.taskId),
        refresh: () => fetchDartTask(identity.taskId, { sourceContext, force: true }),
        patch: (patch) => patchDartTask(identity, patch),
        invalidateLists: () => invalidateDartLists(identity)
      })
    },
    [displayedRef, identity, sourceContext, fetchDartTask, patchDartTask, invalidateDartLists]
  )

  const onUpdate = useCallback<DartDetailEditApi['onUpdate']>(
    (updates, optimistic) =>
      enqueueWrite(
        optimistic,
        editedFields(Object.fromEntries(Object.keys(updates).map((field) => [field, undefined]))),
        (taskId) => updateDartTask(taskId, updates, { sourceContext })
      ),
    [enqueueWrite, sourceContext, updateDartTask]
  )

  const onSavePatch = useCallback<DartDetailDescriptionApi['onSavePatch']>(
    (updates) =>
      enqueueWrite({}, ['description'], (taskId) =>
        updateDartTaskDescription({ taskId, updates }, { sourceContext })
      ),
    [enqueueWrite, sourceContext, updateDartTaskDescription]
  )

  const onAddComment = useCallback<DartDetailCommentsApi['onAddComment']>(
    ({ text, parentId }) =>
      identity
        ? addDartComment(
            { taskId: identity.taskId, text, ...(parentId ? { parentId } : {}) },
            { sourceContext }
          )
        : Promise.resolve(noOpenDartTaskFailure()),
    [addDartComment, identity, sourceContext]
  )

  const dismissNotice = useCallback<DartNoticeApi['dismissNotice']>(() => {
    if (identity) {
      dismissDartTaskNotice(identity)
    }
  }, [identity])
  const recheckNotice = useCallback<DartNoticeApi['recheckNotice']>(
    () => (identity ? recheckDartTaskNotice(identity) : Promise.resolve()),
    [identity]
  )

  const registerCloseGuard = useCallback<DartDetailDescriptionApi['registerCloseGuard']>(
    (guard) => {
      const guards = closeGuardsRef.current
      guards.add(guard)
      return () => {
        guards.delete(guard)
      }
    },
    []
  )
  /** False keeps the detail open. */
  const runCloseGuards = useCallback(async (): Promise<boolean> => {
    for (const guard of closeGuardsRef.current) {
      if (!(await guard())) {
        return false
      }
    }
    return true
  }, [])

  return {
    onUpdate,
    onSavePatch,
    onAddComment,
    pendingFields: writeState.pendingFields,
    blockedFields: writeState.blockedFields,
    notice: writeState.notice,
    dismissNotice,
    recheckNotice,
    registerCloseGuard,
    runCloseGuards
  }
}
