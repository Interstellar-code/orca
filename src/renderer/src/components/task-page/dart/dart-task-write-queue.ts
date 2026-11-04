import type { DartTask } from '../../../../../shared/dart/dart-types'
import { translate } from '@/i18n/i18n'
import { taskProviderErrorMessage } from '@/lib/task-provider-error-copy'
import type { DartWriteFailure } from '@/runtime/runtime-dart-write-client'
import { beginDartMutation } from '@/store/slices/dart/dart-read-coordination'
import {
  bumpDartEpochs,
  dartTaskIdentityKey,
  type DartTaskIdentity
} from '@/store/slices/dart/dart-task-identity'
import {
  absorbRead,
  blockedFields,
  editedFields,
  guardDartQueueCallback,
  pickFields,
  publish,
  readTask,
  releaseIfIdle,
  visiblePatches,
  writes,
  type DartTaskRead,
  type DartTaskWrite,
  type EditableDartTaskField,
  type OpenNotice,
  type QueuedWrite,
  type TaskWrites
} from './dart-task-write-state'

export {
  dartTaskWriteState,
  dismissDartTaskNotice,
  pendingDartPatches,
  recheckDartTaskNotice,
  subscribeDartTaskWrites,
  withPendingDartPatches,
  type DartTaskWriteState,
  type DartTaskWriteUpdate,
  type EditableDartTaskField
} from './dart-task-write-state'

function unknownNoticeMessage(): string {
  return translate(
    'auto.components.task.page.dart.dart-task-write-queue.mayHaveApplied',
    'Dart may have applied this change. Showing what Dart had when Orca last checked.'
  )
}

function blockedFieldFailure(): DartWriteFailure {
  return {
    ok: false,
    outcome: 'notApplied',
    error: translate(
      'auto.components.task.page.dart.dart-task-write-queue.fieldBlocked',
      'Dart may have applied an earlier change to this field. Check again or dismiss the notice before editing it.'
    )
  }
}

function noticeField(fields: readonly EditableDartTaskField[]): { field?: string } {
  return fields.length === 1 ? { field: fields[0] } : {}
}

function rollsBack(result: DartWriteFailure): boolean {
  return (
    result.outcome === 'notApplied' ||
    result.errorCode === 'dart.rateLimited' ||
    result.errorCode === 'dart.unauthorized'
  )
}

function removePending(entry: TaskWrites, queued: QueuedWrite): void {
  entry.pending.splice(entry.pending.indexOf(queued), 1)
}

function publishRollback(entry: TaskWrites, queued: QueuedWrite): void {
  removePending(entry, queued)
  const lastKnown = { ...entry.confirmed, ...visiblePatches(entry) }
  publish(entry, 'rollback', pickFields(lastKnown, queued.fields))
}

async function settleSaved(
  entry: TaskWrites,
  queued: QueuedWrite,
  saved: DartTask,
  invalidateLists: () => void
): Promise<void> {
  entry.confirmed = { ...entry.confirmed, ...queued.patch, ...saved }
  invalidateLists()
  const latest = await readTask(entry.refresh)
  if (latest) {
    absorbRead(entry, latest)
  }
  removePending(entry, queued)
  publish(entry, 'confirmed', {
    ...(latest ?? { ...queued.patch, ...saved }),
    ...visiblePatches(entry)
  })
}

function settleRefused(entry: TaskWrites, queued: QueuedWrite, result: DartWriteFailure): void {
  publishRollback(entry, queued)
  const overlaps = (open: OpenNotice): boolean =>
    open.notice.kind === 'refused' && open.fields.some((field) => queued.fields.includes(field))
  entry.notices = entry.notices.filter((open) => !overlaps(open))
  entry.notices.push({
    ...queued,
    evidenced: false,
    notice: {
      kind: 'refused',
      message: taskProviderErrorMessage(result),
      ...noticeField(queued.fields)
    }
  })
  publish(entry, 'notice', {})
}

async function settleUnknown(
  entry: TaskWrites,
  queued: QueuedWrite,
  invalidateLists: () => void
): Promise<void> {
  removePending(entry, queued)
  entry.notices.push({
    ...queued,
    evidenced: false,
    notice: { kind: 'unknown', message: unknownNoticeMessage(), ...noticeField(queued.fields) }
  })
  // The write may have landed, so a page cached before it can no longer be trusted.
  invalidateLists()
  publish(entry, 'notice', {})
  const latest = await readTask(entry.refresh)
  if (latest) {
    absorbRead(entry, latest)
    publish(entry, 'evidence', { ...latest, ...visiblePatches(entry) })
  }
}

async function sendWrite(write: () => Promise<DartTaskWrite>): Promise<DartTaskWrite> {
  try {
    return await write()
  } catch (error) {
    // The client reports its own failures; anything thrown here cannot prove the write did not land.
    return {
      ok: false,
      outcome: 'unknown',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/** One write at a time per task; never retries, never throws, and always returns the client's result. */
export function enqueueDartTaskWrite(args: {
  identity: DartTaskIdentity
  previous: DartTask
  optimistic: Partial<DartTask>
  /** Fields the write changes that `optimistic` leaves out, such as a description shown only after the reply. */
  fields?: readonly EditableDartTaskField[]
  write: () => Promise<DartTaskWrite>
  refresh: () => Promise<DartTaskRead>
  patch: (patch: Partial<DartTask>) => void
  invalidateLists: () => void
}): Promise<DartTaskWrite> {
  const { identity, previous, optimistic, write, refresh, patch } = args
  const invalidateLists = (): void => guardDartQueueCallback(args.invalidateLists)
  const key = dartTaskIdentityKey(identity)
  const existing = writes.get(key)
  const fields = [...new Set([...editedFields(optimistic), ...(args.fields ?? [])])]
  const blocked = blockedFields(existing)
  if (fields.some((field) => blocked.has(field))) {
    return Promise.resolve(blockedFieldFailure())
  }

  const entry: TaskWrites = existing ?? {
    identity,
    confirmed: previous,
    pending: [],
    notices: [],
    tail: null,
    recheck: null,
    refresh,
    patch
  }
  entry.refresh = refresh
  entry.patch = patch
  // `previous` is what the caller shows, so its queued and unreconciled fields are not server state.
  const shownOnly = [...entry.pending.flatMap((queued) => queued.fields), ...blocked]
  entry.confirmed = { ...previous, ...pickFields(entry.confirmed, shownOnly) }
  const queued: QueuedWrite = { patch: optimistic, fields }
  entry.pending.push(queued)
  writes.set(key, entry)
  publish(entry, 'optimistic', optimistic)

  const predecessor = entry.tail
  const request = (async (): Promise<DartTaskWrite> => {
    await predecessor
    // An earlier queued write to this field came back unknown while this one waited.
    const nowBlocked = blockedFields(entry)
    if (queued.fields.some((field) => nowBlocked.has(field))) {
      publishRollback(entry, queued)
      return blockedFieldFailure()
    }
    beginDartMutation()
    bumpDartEpochs(identity)
    const result = await sendWrite(write)
    // Reads that started during the write can hold the old value too, so they must not cache it.
    beginDartMutation()
    if (result.ok) {
      await settleSaved(entry, queued, result.task, invalidateLists)
    } else if (rollsBack(result)) {
      settleRefused(entry, queued, result)
    } else {
      await settleUnknown(entry, queued, invalidateLists)
    }
    bumpDartEpochs(identity)
    return result
  })()
  entry.tail = request
  void request.then(() => {
    if (entry.tail === request) {
      entry.tail = null
    }
    releaseIfIdle(key, entry)
  })
  return request
}
