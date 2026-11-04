import {
  DART_PROVIDER_RUNTIME_CAPABILITY,
  DART_WRITES_V2_RUNTIME_CAPABILITY
} from '../../../shared/dart/dart-capabilities'
import { checkDartRequestText, type DartTextField } from '../../../shared/dart/dart-text-limits'
import type { DartComment, DartTask } from '../../../shared/dart/dart-types'
import type {
  DartAddCommentArgs,
  DartCreateTaskArgs,
  DartMethodName,
  DartUpdateTaskArgs,
  DartUpdateTaskDescriptionArgs
} from '../../../shared/rpc-contract/dart-params'
import type { RuntimeClientTarget } from '../../../shared/runtime-client-target'
import type { TaskProviderErrorCode } from '../../../shared/task-provider-failure'
import { isRemoteRuntimeRequestTooLargeMessage } from '../../../shared/remote-runtime/remote-runtime-memory-limits'
import { translate } from '@/i18n/i18n'
import {
  CAPABILITY_PROBE_TIMEOUT_MS,
  dartUpdateRequiredMessage,
  isFailureShape,
  isRecord,
  malformedReplyFailure,
  sanitizeDartComment,
  sanitizeDartTask,
  type DartClientFailure
} from './runtime-dart-client'
import { callRuntimeRpc, runtimeEnvironmentSupportsCapability } from './runtime-rpc-client'

/** `applied` is for callers that confirm a write (T3); this client only returns `notApplied` or `unknown` on failure. */
export type DartWriteOutcome = 'applied' | 'notApplied' | 'unknown'
export type DartWriteFailure = DartClientFailure & { outcome: 'notApplied' | 'unknown' }
export type DartWriteResult<T extends object> = ({ ok: true } & T) | DartWriteFailure
/** No `description`: an existing task's description changes only through the targeted patch. */
export type DartFieldUpdates = Omit<DartUpdateTaskArgs['updates'], 'description'> & {
  description?: never
}

// Mirrors DART_WRITE_TIMEOUT_MS in web-dart-api.ts: the host allows 30 s per request and a write may read `/config` twice first.
const DART_WRITE_TIMEOUT_MS = 100_000
export function dartWritesUpdateRequiredMessage(): string {
  return translate(
    'taskProviders.dart.writesUpdateRequired',
    'Update the remote Orca server to edit this field in Dart.'
  )
}

export function dartTextTooLargeMessage(size?: {
  amount: number
  limit: number
  unit: 'characters' | 'bytes'
}): string {
  if (size?.unit === 'bytes') {
    return translate(
      'taskProviders.dart.textTooLargeKb',
      'This text is too large to save to Dart from Orca ({{size}} KB, limit {{limit}} KB). Shorten it or edit it in Dart.',
      { size: Math.ceil(size.amount / 1024), limit: Math.floor(size.limit / 1024) }
    )
  }
  if (size) {
    return translate(
      'taskProviders.dart.textTooLongChars',
      'This text is too long to save to Dart from Orca ({{size}} characters, limit {{limit}}). Shorten it or edit it in Dart.',
      { size: size.amount, limit: size.limit }
    )
  }
  return translate(
    'taskProviders.dart.requestTooLarge',
    'This change is too large to save to Dart from Orca. Shorten it or edit it in Dart.'
  )
}

/** D5: a remote target is probed; a local target asks its bridge (always true on desktop, a host probe in the web client). */
export async function dartSupportsWritesV2ForTarget(target: RuntimeClientTarget): Promise<boolean> {
  try {
    return target.kind === 'environment'
      ? await runtimeEnvironmentSupportsCapability(
          target.environmentId,
          DART_WRITES_V2_RUNTIME_CAPABILITY,
          CAPABILITY_PROBE_TIMEOUT_MS
        )
      : await window.api.dart.supportsWritesV2()
  } catch {
    // A missing or switched host is "no writes v2": send nothing.
    return false
  }
}

const NOT_APPLIED_CODES: ReadonlySet<TaskProviderErrorCode> = new Set([
  'dart.badRequest',
  'dart.unauthorized',
  'dart.rateLimited',
  'dart.taskNotFound',
  'dart.notConnected',
  'dart.descriptionPatchRefused'
])

function notApplied(error: string): DartWriteFailure {
  return { ok: false, error, outcome: 'notApplied' }
}

// D3: a reply from an older host carries no outcome; only codes that prove a refusal count as notApplied.
function classifyFailureReply(reply: DartClientFailure): DartWriteFailure {
  if ('outcome' in reply && (reply.outcome === 'notApplied' || reply.outcome === 'unknown')) {
    return { ...reply, outcome: reply.outcome }
  }
  return {
    ...reply,
    outcome: reply.errorCode && NOT_APPLIED_CODES.has(reply.errorCode) ? 'notApplied' : 'unknown'
  }
}

function errorCodeOf(error: unknown): string | null {
  return isRecord(error) && typeof error.code === 'string' ? error.code : null
}

function failureFromThrown(error: unknown, requestSent: boolean): DartWriteFailure {
  const message = error instanceof Error ? error.message : String(error)
  // invalid_argument: the request was refused before sending or not accepted by the host.
  if (errorCodeOf(error) === 'invalid_argument') {
    return isRemoteRuntimeRequestTooLargeMessage(message)
      ? notApplied(dartTextTooLargeMessage())
      : { ok: false, error: message, errorCode: 'dart.badRequest', outcome: 'notApplied' }
  }
  return { ok: false, error: message, outcome: requestSent ? 'unknown' : 'notApplied' }
}

/** Never retries: a write that failed after dispatch is reported `unknown`, not resent. */
async function callDartWrite<T extends object>(
  target: RuntimeClientTarget,
  method: DartMethodName,
  params: unknown,
  local: () => Promise<unknown>
): Promise<DartWriteResult<T>> {
  let requestSent = false
  let reply: unknown
  try {
    if (target.kind === 'environment') {
      if (
        !(await runtimeEnvironmentSupportsCapability(
          target.environmentId,
          DART_PROVIDER_RUNTIME_CAPABILITY,
          CAPABILITY_PROBE_TIMEOUT_MS
        ))
      ) {
        return notApplied(dartUpdateRequiredMessage())
      }
      reply = await callRuntimeRpc<unknown>(target, method, params, {
        timeoutMs: DART_WRITE_TIMEOUT_MS,
        beforeSend: () => {
          requestSent = true
        }
      })
    } else {
      requestSent = true
      reply = await local()
    }
  } catch (error) {
    return failureFromThrown(error, requestSent)
  }
  if (isFailureShape(reply)) {
    return classifyFailureReply(reply)
  }
  if (!isRecord(reply) || reply.ok !== true) {
    return { ...malformedReplyFailure(), outcome: 'unknown' }
  }
  // SAFETY: the host replies with the DartResult<T> shape for this method; the checks above confirm ok: true.
  return reply as { ok: true } & T
}

// Contract inputs are `unknown` for text fields (the host schema coerces them); only strings can exceed a limit.
function textRefusal(field: DartTextField, texts: unknown): DartWriteFailure | null {
  const list = (Array.isArray(texts) ? texts : [texts]).filter(
    (text): text is string => typeof text === 'string'
  )
  const check = checkDartRequestText(field, list)
  return check.ok
    ? null
    : notApplied(
        dartTextTooLargeMessage({ amount: check.size, limit: check.limit, unit: check.unit })
      )
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

function needsWritesV2(fields: { size?: unknown; startAt?: unknown; dueAt?: unknown }): boolean {
  return (
    fields.size !== undefined ||
    [fields.startAt, fields.dueAt].some(
      (value) => typeof value === 'string' && DATE_ONLY.test(value)
    )
  )
}

async function writesV2Refusal(
  target: RuntimeClientTarget,
  required: boolean
): Promise<DartWriteFailure | null> {
  if (!required || (await dartSupportsWritesV2ForTarget(target))) {
    return null
  }
  return notApplied(dartWritesUpdateRequiredMessage())
}

function sanitizeTaskReply(
  result: DartWriteResult<{ task: DartTask }>
): DartWriteResult<{ task: DartTask }> {
  return result.ok ? { ...result, task: sanitizeDartTask(result.task) } : result
}

export async function dartCreateTaskForTarget(
  target: RuntimeClientTarget,
  args: DartCreateTaskArgs
): Promise<DartWriteResult<{ task: DartTask }>> {
  const refusal =
    textRefusal('title', args.title) ??
    textRefusal('description', args.description) ??
    (await writesV2Refusal(target, needsWritesV2(args)))
  if (refusal) {
    return refusal
  }
  return sanitizeTaskReply(
    await callDartWrite<{ task: DartTask }>(target, 'dart.createTask', args, () =>
      window.api.dart.createTask(args)
    )
  )
}

export async function dartUpdateTaskForTarget(
  target: RuntimeClientTarget,
  taskId: string,
  updates: DartFieldUpdates
): Promise<DartWriteResult<{ task: DartTask }>> {
  const refusal =
    textRefusal('title', updates.title) ?? (await writesV2Refusal(target, needsWritesV2(updates)))
  if (refusal) {
    return refusal
  }
  // Runtime guard for untyped callers: a description never goes through dart.updateTask.
  const { description: _dropped, ...fieldUpdates } = updates
  const args: DartUpdateTaskArgs = { taskId, updates: fieldUpdates }
  return sanitizeTaskReply(
    await callDartWrite<{ task: DartTask }>(target, 'dart.updateTask', args, () =>
      window.api.dart.updateTask(args)
    )
  )
}

export async function dartUpdateTaskDescriptionForTarget(
  target: RuntimeClientTarget,
  args: DartUpdateTaskDescriptionArgs
): Promise<DartWriteResult<{ task: DartTask }>> {
  const refusal =
    textRefusal(
      'descriptionPatch',
      args.updates.flatMap((update) => [update.oldText, update.anchorText, update.newText])
    ) ?? (await writesV2Refusal(target, true))
  if (refusal) {
    return refusal
  }
  return sanitizeTaskReply(
    await callDartWrite<{ task: DartTask }>(target, 'dart.updateTaskDescription', args, () =>
      window.api.dart.updateTaskDescription(args)
    )
  )
}

export async function dartAddCommentForTarget(
  target: RuntimeClientTarget,
  args: DartAddCommentArgs
): Promise<DartWriteResult<{ comment: DartComment }>> {
  const refusal = textRefusal('comment', args.text)
  if (refusal) {
    return refusal
  }
  const result = await callDartWrite<{ comment: DartComment }>(
    target,
    'dart.addComment',
    args,
    () => window.api.dart.addComment(args)
  )
  return result.ok ? { ...result, comment: sanitizeDartComment(result.comment) } : result
}
