import type { DartTask, DartTaskRelationships } from '../../../../../shared/dart/dart-types'
import { ListTasks, UpdateTaskBlockers } from '../../../../../shared/rpc-contract/dart-params'
import type { Failure, RpcParams } from './dart-fake-rpc-params.test-support'

export function relationshipsFixture(
  overrides: Partial<DartTaskRelationships> = {}
): DartTaskRelationships {
  return {
    subtaskIds: [],
    blockerIds: [],
    blockingIds: [],
    duplicateIds: [],
    relatedIds: [],
    ...overrides
  }
}

function refusal(error: string, errorCode: string): Failure {
  return { ok: false, error, errorCode, outcome: 'notApplied' }
}

/** Rows a `parentId` or `ids` list query matches, with the limits the real host enforces; list items carry no links. */
export function selectFakeListRows(
  tasks: Iterable<DartTask>,
  params: RpcParams
): DartTask[] | Failure {
  const raw: Record<string, unknown> = { ...params }
  const query = ListTasks.safeParse({ parentId: raw.parentId, ids: raw.ids })
  if (!query.success) {
    return {
      ok: false,
      error: query.error.issues[0]?.message ?? 'Invalid Dart request.',
      errorCode: 'dart.badRequest'
    }
  }
  const parentId = query.data?.parentId
  const ids = query.data?.ids ? new Set(query.data.ids) : null
  return [...tasks]
    .filter(
      (task) => (parentId === undefined || task.parentId === parentId) && (!ids || ids.has(task.id))
    )
    .map(({ relationships: _omitted, ...row }) => row)
}

export type BlockerWritePlan =
  | { failure: Failure }
  | { taskId: string; changes: { relationships: DartTaskRelationships } }

/** Mirrors the host's pre-read: only `blockerIds` changes, and a task without links data is never written. */
export function planBlockerWrite(
  params: RpcParams,
  tasks: ReadonlyMap<string, DartTask>,
  failReads: boolean,
  dartCalls: string[]
): BlockerWritePlan {
  const parsed = UpdateTaskBlockers.safeParse(params)
  if (!parsed.success) {
    return {
      failure: refusal(
        parsed.error.issues[0]?.message ?? 'Invalid Dart request.',
        'dart.badRequest'
      )
    }
  }
  const { taskId, blockerIds } = parsed.data
  dartCalls.push(`GET /tasks/${taskId}`)
  if (failReads) {
    return { failure: refusal('Could not update blockers.', 'dart.updateFailed') }
  }
  const current = tasks.get(taskId)
  if (!current) {
    return { failure: refusal('Task not found.', 'dart.taskNotFound') }
  }
  if (!current.relationships) {
    return { failure: refusal("Dart did not return this task's links", 'dart.updateFailed') }
  }
  dartCalls.push(`PUT /tasks/${taskId}`)
  return { taskId, changes: { relationships: { ...current.relationships, blockerIds } } }
}
