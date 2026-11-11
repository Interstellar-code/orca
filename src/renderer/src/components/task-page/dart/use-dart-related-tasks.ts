import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DartTask, DartTaskRelationships } from '../../../../../shared/dart/dart-types'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import { translate } from '@/i18n/i18n'
import { taskProviderErrorMessage, taskProviderErrorText } from '@/lib/task-provider-error-copy'
import { useAppStore } from '@/store'
import type { DartReadScope } from '@/store/slices/dart/dart-read-coordination'
import type { DartLoad, DartTaskPage } from './dart-board-contracts'

type IdsRead = {
  readKey: string
  taskKey: string | null
  state: 'ready' | 'error'
  data: DartTaskPage | null
  error: string | null
}

const EMPTY_PAGE: DartTaskPage = { tasks: [], total: 0, complete: true }
const IDLE_LOAD: DartLoad<DartTaskPage> = {
  state: 'idle',
  data: null,
  error: null,
  retry: () => {}
}

function orderedByIds(tasks: readonly DartTask[], ids: readonly string[]): DartTask[] {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  return ids.flatMap((id) => byId.get(id) ?? [])
}

/** Titles and statuses for `ids`; a reply for another task or another id list is never shown. */
function useDartTasksByIds(args: {
  taskKey: string | null
  ids: readonly string[] | null
  sourceContext: TaskSourceContext | null
  scope: DartReadScope
}): DartLoad<DartTaskPage> {
  const { taskKey, ids, sourceContext, scope } = args
  const readDartTasksByIds = useAppStore((s) => s.readDartTasksByIds)
  const [nonce, setNonce] = useState(0)
  const [stored, setStored] = useState<IdsRead | null>(null)
  const idsKey = ids ? ids.join(',') : null
  const readKey = idsKey === null ? null : JSON.stringify([taskKey, idsKey, nonce])
  const retry = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (readKey === null || !taskKey || !idsKey) {
      return
    }
    let cancelled = false
    const ordered = idsKey.split(',')
    const settle = (next: Omit<IdsRead, 'readKey' | 'taskKey'>): void => {
      if (!cancelled) {
        setStored({ readKey, taskKey, ...next })
      }
    }
    readDartTasksByIds(ordered, { sourceContext, scope })
      .then((result) =>
        result.ok
          ? settle({
              state: 'ready',
              data: {
                tasks: orderedByIds(result.tasks, ordered),
                total: result.total,
                complete: result.complete
              },
              error: null
            })
          : settle({ state: 'error', data: null, error: taskProviderErrorMessage(result) })
      )
      .catch(() =>
        settle({
          state: 'error',
          data: null,
          error: taskProviderErrorText(undefined, 'dart.loadFailed')
        })
      )
    return () => {
      cancelled = true
    }
  }, [readKey, taskKey, idsKey, readDartTasksByIds, sourceContext, scope])

  return useMemo<DartLoad<DartTaskPage>>(() => {
    if (readKey === null) {
      return IDLE_LOAD
    }
    if (ids && ids.length === 0) {
      return { state: 'ready', data: EMPTY_PAGE, error: null, retry }
    }
    if (stored?.readKey === readKey) {
      return { state: stored.state, data: stored.data, error: stored.error, retry }
    }
    // Same task, other ids (an optimistic edit): keep the last rows on screen while the read runs.
    const kept = stored?.taskKey === taskKey ? stored.data : null
    return { state: 'loading', data: kept, error: null, retry }
  }, [readKey, ids, stored, taskKey, retry])
}

/** Parent, "Blocked by", "Blocking" and Subtasks, one id read each (D13.6); a failed task read retries through retryLinks. */
export function useDartRelatedTasks(args: {
  taskKey: string | null
  parentId: string | null | undefined
  relationships: DartTaskRelationships | null
  linksFailed: boolean
  retryLinks: () => void
  sourceContext: TaskSourceContext | null
  scope: DartReadScope
}): {
  parent: DartLoad<DartTask> | null
  blockers: DartLoad<readonly DartTask[]>
  blocking: DartLoad<readonly DartTask[]>
  subtasks: DartLoad<DartTaskPage>
} {
  const { taskKey, parentId, relationships, linksFailed, retryLinks, sourceContext, scope } = args
  const read = { taskKey, sourceContext, scope }
  const parentIds = useMemo(() => (parentId ? [parentId] : null), [parentId])
  const parentRead = useDartTasksByIds({ ...read, ids: parentIds })
  const blockersRead = useDartTasksByIds({ ...read, ids: relationships?.blockerIds ?? null })
  const blockingRead = useDartTasksByIds({ ...read, ids: relationships?.blockingIds ?? null })
  const subtasksRead = useDartTasksByIds({ ...read, ids: relationships?.subtaskIds ?? null })
  const retryFor = (own: () => void): (() => void) => (linksFailed ? retryLinks : own)

  const parent = useMemo<DartLoad<DartTask> | null>(() => {
    if (!parentIds) {
      return null
    }
    const found = parentRead.data?.tasks[0] ?? null
    const missing = parentRead.state === 'ready' && !found
    return {
      state: missing ? 'error' : parentRead.state,
      data: found,
      error: missing
        ? translate(
            'auto.components.task.page.dart.use-dart-task-relationships.parentMissing',
            'Dart did not return the parent task.'
          )
        : parentRead.error,
      retry: parentRead.retry
    }
  }, [parentIds, parentRead])
  const blockers = useMemo<DartLoad<readonly DartTask[]>>(
    () => ({
      ...blockersRead,
      data: blockersRead.data?.tasks ?? null,
      retry: retryFor(blockersRead.retry)
    }),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- Why: retryFor only closes over linksFailed and retryLinks.
    [blockersRead, linksFailed, retryLinks]
  )
  const blocking = useMemo<DartLoad<readonly DartTask[]>>(
    () => ({
      ...blockingRead,
      data: blockingRead.data?.tasks ?? null,
      retry: retryFor(blockingRead.retry)
    }),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- Why: retryFor only closes over linksFailed and retryLinks.
    [blockingRead, linksFailed, retryLinks]
  )
  const subtasks = useMemo<DartLoad<DartTaskPage>>(
    () => ({ ...subtasksRead, retry: retryFor(subtasksRead.retry) }),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- Why: retryFor only closes over linksFailed and retryLinks.
    [subtasksRead, linksFailed, retryLinks]
  )
  return { parent, blockers, blocking, subtasks }
}
