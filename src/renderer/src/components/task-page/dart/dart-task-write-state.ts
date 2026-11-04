import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { DartClientResult } from '@/runtime/runtime-dart-client'
import type { DartWriteResult } from '@/runtime/runtime-dart-write-client'
import {
  captureDartEpoch,
  dartTaskIdentityKey,
  isDartEpochCurrent,
  type DartAccountIdentity,
  type DartTaskIdentity
} from '@/store/slices/dart/dart-task-identity'
import type { DartWriteNotice } from './dart-detail-contracts'

const EDITABLE_DART_TASK_FIELDS = [
  'title',
  'description',
  'dartboard',
  'type',
  'status',
  'priority',
  'assignee',
  'tags',
  'size',
  'startAt',
  'dueAt'
] as const
export type EditableDartTaskField = (typeof EDITABLE_DART_TASK_FIELDS)[number]

export type DartTaskWrite = DartWriteResult<{ task: DartTask }>
export type DartTaskRead = DartClientResult<{ task: DartTask }>

export type DartTaskWriteUpdate = {
  kind: 'optimistic' | 'confirmed' | 'rollback' | 'evidence' | 'notice'
  patch: Partial<DartTask>
}
type DartTaskWriteListener = (update: DartTaskWriteUpdate) => void

export type DartTaskWriteState = {
  /** Writes queued or in flight. */
  pendingFields: ReadonlySet<string>
  /** Unreconciled unknown writes; the optimistic marker stays and nothing is sent until the user dismisses the notice. */
  blockedFields: ReadonlySet<string>
  notice: DartWriteNotice | null
}

export type QueuedWrite = { patch: Partial<DartTask>; fields: readonly EditableDartTaskField[] }
export type OpenNotice = QueuedWrite & {
  notice: DartWriteNotice
  /** Unknown only: a successful read replaced the optimistic value as what the user sees. */
  evidenced: boolean
}
export type TaskWrites = {
  identity: DartTaskIdentity
  confirmed: DartTask
  pending: QueuedWrite[]
  notices: OpenNotice[]
  tail: Promise<unknown> | null
  recheck: Promise<void> | null
  refresh: () => Promise<DartTaskRead>
  patch: (patch: Partial<DartTask>) => void
}

export const writes = new Map<string, TaskWrites>()
const listeners = new Map<string, Set<DartTaskWriteListener>>()

export function editedFields(patch: Partial<DartTask>): EditableDartTaskField[] {
  return EDITABLE_DART_TASK_FIELDS.filter((field) => field in patch)
}

export function pickFields(
  task: Partial<DartTask>,
  fields: readonly EditableDartTaskField[]
): Partial<DartTask> {
  const picked: Partial<DartTask> = {}
  for (const field of fields) {
    Object.assign(picked, { [field]: task[field] })
  }
  return picked
}

export function unknownNotices(entry: TaskWrites): OpenNotice[] {
  return entry.notices.filter((open) => open.notice.kind === 'unknown')
}

export function blockedFields(entry: TaskWrites | undefined): Set<EditableDartTaskField> {
  return new Set(entry ? unknownNotices(entry).flatMap((open) => open.fields) : [])
}

// An unknown write with no successful read since keeps its value on screen: nothing says Dart has anything else.
export function visiblePatches(entry: TaskWrites): Partial<DartTask> {
  const merged: Partial<DartTask> = {}
  for (const open of unknownNotices(entry)) {
    if (!open.evidenced) {
      Object.assign(merged, open.patch)
    }
  }
  for (const queued of entry.pending) {
    Object.assign(merged, queued.patch)
  }
  return merged
}

export function publish(
  entry: TaskWrites,
  kind: DartTaskWriteUpdate['kind'],
  patch: Partial<DartTask>
): void {
  if (Object.keys(patch).length > 0) {
    entry.patch(patch)
  }
  for (const listener of listeners.get(dartTaskIdentityKey(entry.identity)) ?? []) {
    listener({ kind, patch })
  }
}

// Writes run one at a time, so a forced read is server state: a queued write has not been sent yet.
export function absorbRead(entry: TaskWrites, task: DartTask): void {
  entry.confirmed = task
  for (const open of unknownNotices(entry)) {
    open.evidenced = true
    open.notice = { ...open.notice, checkedAt: Date.now() }
  }
}

export async function readTask(read: () => Promise<DartTaskRead>): Promise<DartTask | null> {
  try {
    const result = await read()
    return result.ok ? result.task : null
  } catch {
    return null
  }
}

export function releaseIfIdle(key: string, entry: TaskWrites): void {
  if (writes.get(key) === entry && entry.pending.length === 0 && entry.notices.length === 0) {
    writes.delete(key)
  }
}

export function subscribeDartTaskWrites(
  identity: DartTaskIdentity,
  listener: DartTaskWriteListener,
  replay: (patch: Partial<DartTask>) => void
): () => void {
  const key = dartTaskIdentityKey(identity)
  const subscribers = listeners.get(key) ?? new Set<DartTaskWriteListener>()
  subscribers.add(listener)
  listeners.set(key, subscribers)
  const pending = pendingDartPatches(identity)
  if (Object.keys(pending).length > 0) {
    replay(pending)
  }
  return () => {
    subscribers.delete(listener)
    if (subscribers.size === 0 && listeners.get(key) === subscribers) {
      listeners.delete(key)
    }
  }
}

export function pendingDartPatches(identity: DartTaskIdentity): Partial<DartTask> {
  const entry = writes.get(dartTaskIdentityKey(identity))
  return entry ? visiblePatches(entry) : {}
}

/** Re-applies optimistic values over rows a read just returned; `account` keeps a same-id task of another host or account out. */
export function withPendingDartPatches(
  tasks: readonly DartTask[],
  account: DartAccountIdentity
): DartTask[] {
  return tasks.map((task) => ({
    ...task,
    ...pendingDartPatches({ ...account, taskId: task.id })
  }))
}

function headNotice(entry: TaskWrites): OpenNotice | null {
  return unknownNotices(entry)[0] ?? entry.notices.at(-1) ?? null
}

export function dartTaskWriteState(identity: DartTaskIdentity): DartTaskWriteState {
  const entry = writes.get(dartTaskIdentityKey(identity))
  if (!entry) {
    return { pendingFields: new Set(), blockedFields: new Set(), notice: null }
  }
  return {
    pendingFields: new Set(entry.pending.flatMap((queued) => queued.fields)),
    blockedFields: blockedFields(entry),
    notice: headNotice(entry)?.notice ?? null
  }
}

/** Only the user clears a notice; dismissing an unknown one also lifts its block on the field. */
export function dismissDartTaskNotice(identity: DartTaskIdentity): void {
  const key = dartTaskIdentityKey(identity)
  const entry = writes.get(key)
  const head = entry && headNotice(entry)
  if (!entry || !head) {
    return
  }
  entry.notices = entry.notices.filter((open) => open !== head)
  publish(entry, 'notice', {})
  releaseIfIdle(key, entry)
}

/** Another forced read: evidence, not proof, so the notice stays; a failed or overtaken read changes nothing. */
export function recheckDartTaskNotice(identity: DartTaskIdentity): Promise<void> {
  const entry = writes.get(dartTaskIdentityKey(identity))
  if (!entry || unknownNotices(entry).length === 0) {
    return Promise.resolve()
  }
  if (entry.recheck) {
    return entry.recheck
  }
  const captured = captureDartEpoch(identity)
  const recheck = readTask(entry.refresh)
    .then((latest) => {
      if (!latest || !isDartEpochCurrent(captured) || unknownNotices(entry).length === 0) {
        return
      }
      absorbRead(entry, latest)
      publish(entry, 'evidence', { ...latest, ...visiblePatches(entry) })
    })
    .finally(() => {
      entry.recheck = null
    })
  entry.recheck = recheck
  return recheck
}
