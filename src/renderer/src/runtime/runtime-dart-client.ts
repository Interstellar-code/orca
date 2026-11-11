import {
  DART_BOARD_RUNTIME_CAPABILITY,
  DART_PROVIDER_RUNTIME_CAPABILITY,
  DART_RELATIONSHIPS_RUNTIME_CAPABILITY
} from '../../../shared/dart/dart-capabilities'
import { isTrustedDartHtmlUrl } from '../../../shared/dart/dart-issue-url'
import type {
  DartComment,
  DartCommentPage,
  DartConnectionStatus,
  DartHostFeatures,
  DartTask,
  DartTaskPage,
  DartUser,
  DartWorkspaceConfig
} from '../../../shared/dart/dart-types'
import type {
  DartListCommentsArgs,
  DartListTasksArgs,
  DartMethodName
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

export const CAPABILITY_PROBE_TIMEOUT_MS = 15_000
const READ_TIMEOUT_MS = 30_000

export function dartUpdateRequiredMessage(): string {
  return translate(
    'taskProviders.dart.updateRequired',
    'Update the remote Orca server to use Dart.'
  )
}

export function dartRelationshipsUpdateRequiredMessage(): string {
  return translate(
    'taskProviders.dart.relationshipsUpdateRequired',
    'Update the remote Orca server to use task links in Dart.'
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

export function isRecord(value: unknown): value is Record<string, unknown> {
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
export function sanitizeDartTask(task: DartTask): DartTask {
  return isTrustedDartHtmlUrl(task.htmlUrl) ? task : { ...task, htmlUrl: '' }
}

export function sanitizeDartComment(comment: DartComment): DartComment {
  return isTrustedDartHtmlUrl(comment.htmlUrl) ? comment : { ...comment, htmlUrl: '' }
}

export function isFailureShape(value: unknown): value is DartClientFailure {
  return isRecord(value) && value.ok === false && typeof value.error === 'string'
}

export function malformedReplyFailure(): DartClientFailure {
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

/** A remote target is probed; a local target asks its bridge (a host probe in the web client). */
export async function dartSupportsRelationshipsForTarget(
  target: RuntimeClientTarget
): Promise<boolean> {
  try {
    return target.kind === 'environment'
      ? await runtimeEnvironmentSupportsCapability(
          target.environmentId,
          DART_RELATIONSHIPS_RUNTIME_CAPABILITY,
          CAPABILITY_PROBE_TIMEOUT_MS
        )
      : (await window.api.dart.supportedDartFeatures()).relationships === true
  } catch {
    return false
  }
}

export async function dartListTasksForTarget(
  target: RuntimeClientTarget,
  args?: DartListTasksArgs
): Promise<DartClientResult<DartTaskPage>> {
  // Why: a host without the capability would drop `parentId`/`ids` and return unfiltered rows, so refuse instead.
  if (
    (args?.parentId !== undefined || args?.ids !== undefined) &&
    !(await dartSupportsRelationshipsForTarget(target))
  ) {
    return { ok: false, error: dartRelationshipsUpdateRequiredMessage() }
  }
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

// Never cached: a host can upgrade or switch between calls, and any failure just hides board and link features.
export async function dartBoardFeaturesForTarget(
  target: RuntimeClientTarget
): Promise<DartHostFeatures> {
  try {
    if (target.kind === 'environment') {
      const [board, relationships] = await Promise.all(
        [DART_BOARD_RUNTIME_CAPABILITY, DART_RELATIONSHIPS_RUNTIME_CAPABILITY].map((capability) =>
          runtimeEnvironmentSupportsCapability(
            target.environmentId,
            capability,
            CAPABILITY_PROBE_TIMEOUT_MS,
            { fresh: true }
          )
        )
      )
      return { board, relationships }
    }
    return await window.api.dart.supportedDartFeatures()
  } catch {
    return { board: false }
  }
}
