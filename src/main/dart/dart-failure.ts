import type { DartFailure } from '../../shared/rpc-contract/dart-params'
import { taskProviderFailure, type TaskProviderErrorCode } from '../../shared/task-provider-failure'
import { DartApiError } from './dart-request'

export type DartOperation =
  | 'connect'
  | 'load'
  | 'getTask'
  | 'comments'
  | 'create'
  | 'update'
  | 'comment'

const OPERATION_FAILURE: Record<DartOperation, { code: TaskProviderErrorCode; message: string }> = {
  connect: { code: 'dart.connectFailed', message: 'Could not connect to Dart.' },
  load: { code: 'dart.loadFailed', message: 'Could not load Dart tasks.' },
  getTask: { code: 'dart.loadFailed', message: 'Could not load the Dart task.' },
  comments: { code: 'dart.loadFailed', message: 'Could not load Dart comments.' },
  create: { code: 'dart.createFailed', message: 'Could not create the Dart task.' },
  update: { code: 'dart.updateFailed', message: 'Could not update the Dart task.' },
  comment: { code: 'dart.commentFailed', message: 'Could not add the Dart comment.' }
}

// Operations addressed by a task id: a 404 (JSON or HTML) means the task is gone.
const TASK_TARGETED = new Set<DartOperation>(['getTask', 'comments', 'update', 'comment'])

function codeForStatus(status: number, operation: DartOperation): TaskProviderErrorCode | null {
  if (status === 401 || status === 403) {
    return 'dart.unauthorized'
  }
  if (status === 429) {
    return 'dart.rateLimited'
  }
  if (status === 404 && TASK_TARGETED.has(operation)) {
    return 'dart.taskNotFound'
  }
  // Comments for an unknown (well-formed) task id answer 400 with a bare string array.
  if (status === 400 && operation === 'comments') {
    return 'dart.taskNotFound'
  }
  if (status === 400 || status === 422) {
    return 'dart.badRequest'
  }
  return null
}

/** Only a 401 revokes the token; a 403 is a per-call permission denial that keeps the cache. */
export function isDartTokenRejected(error: unknown): boolean {
  return error instanceof DartApiError && error.status === 401
}

/** Maps any thrown value to a `dart.*` failure; non-Dart errors never surface their message. */
export function toDartFailure(error: unknown, operation: DartOperation): DartFailure {
  const fallback = OPERATION_FAILURE[operation]
  if (!(error instanceof DartApiError)) {
    return taskProviderFailure(fallback.code, fallback.message)
  }
  const code = error.status === null ? null : codeForStatus(error.status, operation)
  return taskProviderFailure(code ?? fallback.code, error.message)
}
