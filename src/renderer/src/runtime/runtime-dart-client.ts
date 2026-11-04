/* eslint-disable max-lines -- Why: the spec fixes the write contracts and gates in this module; reads and writes share the reply guards and sanitizers. */
import {
  DART_PROVIDER_RUNTIME_CAPABILITY,
  DART_WRITES_V2_RUNTIME_CAPABILITY
} from '../../../shared/dart/dart-capabilities'
import { checkDartRequestText, type DartTextField } from '../../../shared/dart/dart-text-limits'
import { isTrustedDartHtmlUrl } from '../../../shared/dart/dart-issue-url'
import type {
  DartComment,
  DartCommentPage,
  DartConnectionStatus,
  DartTask,
  DartTaskPage,
  DartUser,
  DartWorkspaceConfig
} from '../../../shared/dart/dart-types'
import type {
  DartAddCommentArgs,
  DartCreateTaskArgs,
  DartListCommentsArgs,
  DartListTasksArgs,
  DartMethodName,
  DartUpdateTaskArgs,
  DartUpdateTaskDescriptionArgs
} from '../../../shared/rpc-contract/dart-params'
import type { RuntimeClientTarget } from '../../../shared/runtime-client-target'
import type { SecretAtRestProtection } from '../../../shared/secret-at-rest-protection'
import {
  taskProviderFailure,
  type TaskProviderErrorCode
} from '../../../shared/task-provider-failure'
import { translate } from '@/i18n/i18n'
import { callRuntimeRpc, runtimeEnvironmentSupportsCapability } from './runtime-rpc-client'

/** A contract failure, or the client's own "update the remote server" refusal (no error code). */
export type DartClientFailure = { ok: false; error: string; errorCode?: TaskProviderErrorCode }
export type DartClientResult<T extends object> = ({ ok: true } & T) | DartClientFailure

/** `applied` is for callers that confirm a write (T3); this client only returns `notApplied` or `unknown` on failure. */
export type DartWriteOutcome = 'applied' | 'notApplied' | 'unknown'
export type DartWriteFailure = DartClientFailure & { outcome: 'notApplied' | 'unknown' }
export type DartWriteResult<T extends object> = ({ ok: true } & T) | DartWriteFailure
/** No `description`: an existing task's description changes only through the targeted patch. */
export type DartFieldUpdates = Omit<DartUpdateTaskArgs['updates'], 'description'>

// Mirrors DART_WRITE_TIMEOUT_MS in web-dart-api.ts: the host allows 30 s per request and a write may read `/config` twice first.
const DART_WRITE_TIMEOUT_MS = 100_000
const CAPABILITY_PROBE_TIMEOUT_MS = 15_000
const READ_TIMEOUT_MS = 30_000

export function dartUpdateRequiredMessage(): string {
  return translate(
    'taskProviders.dart.updateRequired',
    'Update the remote Orca server to use Dart.'
  )
}

export class DartUpdateRequiredError extends Error {
  constructor() {
    super(dartUpdateRequiredMessage())
    this.name = 'DartUpdateRequiredError'
  }
}

const SECRET_AT_REST_PROTECTIONS = { sealed: true, plaintext: true } as const satisfies Readonly<
  Record<SecretAtRestProtection, true>
>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSecretAtRestProtection(value: unknown): value is SecretAtRestProtection {
  return typeof value === 'string' && Object.hasOwn(SECRET_AT_REST_PROTECTIONS, value)
}

function parseDartUser(value: unknown): DartUser | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') {
    return null
  }
  return {
    id: value.id,
    name: value.name,
    email: typeof value.email === 'string' ? value.email : null
  }
}

// A missing or malformed reply from another host version must not crash readers or hide a real connection.
export function parseDartConnectionStatus(value: unknown): DartConnectionStatus {
  if (!isRecord(value) || value.ok === false || typeof value.connected !== 'boolean') {
    return { connected: false, viewer: null }
  }
  return {
    connected: value.connected,
    viewer: parseDartUser(value.viewer),
    credentialError: typeof value.credentialError === 'string' ? value.credentialError : undefined,
    credentialProtection:
      value.credentialProtection === null || isSecretAtRestProtection(value.credentialProtection)
        ? value.credentialProtection
        : undefined
  }
}

// Dart replies are untrusted: a task whose link fails validation keeps its data and loses the link.
function sanitizeDartTask(task: DartTask): DartTask {
  return isTrustedDartHtmlUrl(task.htmlUrl) ? task : { ...task, htmlUrl: '' }
}

function sanitizeDartComment(comment: DartComment): DartComment {
  return isTrustedDartHtmlUrl(comment.htmlUrl) ? comment : { ...comment, htmlUrl: '' }
}

function isFailureShape(value: unknown): value is DartClientFailure {
  return isRecord(value) && value.ok === false && typeof value.error === 'string'
}

function malformedReplyFailure(): DartClientFailure {
  return taskProviderFailure('dart.loadFailed', 'Dart returned an unreadable reply.')
}

async function callDart<T extends object>(
  target: RuntimeClientTarget,
  method: DartMethodName,
  params: unknown,
  local: () => Promise<unknown>,
  timeoutMs = READ_TIMEOUT_MS
): Promise<DartClientResult<T>> {
  let reply: unknown
  if (target.kind === 'environment') {
    // No local fallback: a host without the capability must be updated, not bypassed.
    if (
      !(await runtimeEnvironmentSupportsCapability(
        target.environmentId,
        DART_PROVIDER_RUNTIME_CAPABILITY,
        CAPABILITY_PROBE_TIMEOUT_MS
      ))
    ) {
      return { ok: false, error: dartUpdateRequiredMessage() }
    }
    reply = await callRuntimeRpc<unknown>(target, method, params, { timeoutMs })
  } else {
    reply = await local()
  }
  if (isFailureShape(reply)) {
    return reply
  }
  if (!isRecord(reply) || reply.ok !== true) {
    return malformedReplyFailure()
  }
  // SAFETY: the host replies with the DartResult<T> shape for this method; the checks above confirm ok: true.
  return reply as { ok: true } & T
}

export async function dartStatusForTarget(
  target: RuntimeClientTarget
): Promise<DartConnectionStatus> {
  if (
    target.kind === 'environment' &&
    !(await runtimeEnvironmentSupportsCapability(
      target.environmentId,
      DART_PROVIDER_RUNTIME_CAPABILITY,
      CAPABILITY_PROBE_TIMEOUT_MS
    ))
  ) {
    throw new DartUpdateRequiredError()
  }
  const reply =
    target.kind === 'environment'
      ? await callRuntimeRpc<unknown>(target, 'dart.status', undefined, { timeoutMs: 15_000 })
      : await window.api.dart.status()
  // A failed status read is not proof of a disconnect; callers keep their last known status.
  if (isFailureShape(reply)) {
    throw new Error(reply.error)
  }
  return parseDartConnectionStatus(reply)
}

export async function dartConnectForTarget(
  target: RuntimeClientTarget,
  args: { apiToken: string }
): Promise<DartClientResult<{ viewer: DartUser }>> {
  return callDart(target, 'dart.connect', args, () => window.api.dart.connect(args), 30_000)
}

export async function dartDisconnectForTarget(
  target: RuntimeClientTarget
): Promise<DartClientResult<object>> {
  return callDart(target, 'dart.disconnect', undefined, () => window.api.dart.disconnect(), 15_000)
}

export async function dartTestConnectionForTarget(
  target: RuntimeClientTarget
): Promise<DartClientResult<{ viewer: DartUser }>> {
  return callDart(
    target,
    'dart.testConnection',
    undefined,
    () => window.api.dart.testConnection(),
    30_000
  )
}

export async function dartConfigForTarget(
  target: RuntimeClientTarget
): Promise<DartClientResult<{ config: DartWorkspaceConfig }>> {
  return callDart(target, 'dart.config', undefined, () => window.api.dart.config())
}

export async function dartListTasksForTarget(
  target: RuntimeClientTarget,
  args?: DartListTasksArgs
): Promise<DartClientResult<DartTaskPage>> {
  const result = await callDart<DartTaskPage>(target, 'dart.listTasks', args, () =>
    window.api.dart.listTasks(args)
  )
  return result.ok ? { ...result, tasks: result.tasks.map(sanitizeDartTask) } : result
}

export async function dartGetTaskForTarget(
  target: RuntimeClientTarget,
  taskId: string
): Promise<DartClientResult<{ task: DartTask }>> {
  const result = await callDart<{ task: DartTask }>(target, 'dart.getTask', { taskId }, () =>
    window.api.dart.getTask({ taskId })
  )
  return result.ok ? { ...result, task: sanitizeDartTask(result.task) } : result
}

export async function dartListCommentsForTarget(
  target: RuntimeClientTarget,
  args: DartListCommentsArgs
): Promise<DartClientResult<DartCommentPage>> {
  const result = await callDart<DartCommentPage>(target, 'dart.listComments', args, () =>
    window.api.dart.listComments(args)
  )
  return result.ok ? { ...result, comments: result.comments.map(sanitizeDartComment) } : result
}

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
  const outcome: unknown = (reply as { outcome?: unknown }).outcome
  if (outcome === 'notApplied' || outcome === 'unknown') {
    return { ...reply, outcome }
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
  // invalid_argument: the request was refused before sending or not accepted by the host.
  if (errorCodeOf(error) === 'invalid_argument') {
    return notApplied(dartTextTooLargeMessage())
  }
  const message = error instanceof Error ? error.message : String(error)
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
  const args: DartUpdateTaskArgs = { taskId, updates }
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
