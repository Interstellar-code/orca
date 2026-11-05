import type { PreloadApi } from '../../../../preload/api-types'
import {
  DART_UNVERIFIED_WRITE_METHODS,
  type DartMethodContract,
  type DartMethodName
} from '../../../../shared/rpc-contract/dart-params'
import {
  DART_PROVIDER_RUNTIME_CAPABILITY,
  DART_WRITES_V2_RUNTIME_CAPABILITY
} from '../../../../shared/dart/dart-capabilities'
import { taskProviderFailure } from '../../../../shared/task-provider-failure'
import {
  DartUpdateRequiredError,
  dartUpdateRequiredMessage
} from '../../runtime/runtime-dart-client'
import { callRuntimeEnvelope, getRemoteRuntimeStatus } from './web-runtime-calls'
import { assertActiveEnvironment, requireActiveEnvironment } from './web-runtime-session'

// The host allows 30s per Dart request; writes may read `/config` twice before the write.
const DART_READ_TIMEOUT_MS = 45_000
const DART_WRITE_TIMEOUT_MS = 100_000
const DART_SETTINGS_TIMEOUT_MS = 15_000

const DART_WRITE_METHODS = new Set<DartMethodName>(DART_UNVERIFIED_WRITE_METHODS)

async function hostAdvertises(
  capability: string,
  onProbeFailure: 'false' | 'throw'
): Promise<boolean> {
  const environmentId = requireActiveEnvironment().id
  const status =
    onProbeFailure === 'throw'
      ? await getRemoteRuntimeStatus()
      : await getRemoteRuntimeStatus().catch(() => null)
  // Why: the verdict belongs to the probed host; a host switched in mid-probe is never trusted.
  assertActiveEnvironment(environmentId)
  return status?.capabilities?.includes(capability) === true
}

const supportsWritesV2 = (): Promise<boolean> =>
  hostAdvertises(DART_WRITES_V2_RUNTIME_CAPABILITY, 'false')

const PROVIDER_VERDICT_TTL_MS = 60_000
const providerVerdictExpiry = new Map<string, number>()
const providerProbesInFlight = new Map<string, Promise<boolean>>()

// Why: only a positive verdict is cached so an in-place host upgrade is seen on the next call.
async function hostSupportsDartProvider(): Promise<boolean> {
  const environmentId = requireActiveEnvironment().id
  const expiry = providerVerdictExpiry.get(environmentId)
  if (expiry !== undefined && Date.now() < expiry) {
    return true
  }
  const inFlight = providerProbesInFlight.get(environmentId)
  if (inFlight) {
    return inFlight
  }
  // A failed probe rethrows so a network error shows the offline state, not update-required.
  const probe = hostAdvertises(DART_PROVIDER_RUNTIME_CAPABILITY, 'throw')
    .then((supported) => {
      if (supported) {
        providerVerdictExpiry.set(environmentId, Date.now() + PROVIDER_VERDICT_TTL_MS)
      }
      return supported
    })
    .finally(() => providerProbesInFlight.delete(environmentId))
  providerProbesInFlight.set(environmentId, probe)
  return probe
}

export function clearDartProviderVerdictCacheForTests(): void {
  providerVerdictExpiry.clear()
  providerProbesInFlight.clear()
}

async function dartCall<M extends DartMethodName>(
  method: M,
  params?: DartMethodContract[M]['params'],
  timeoutMs?: number
): Promise<DartMethodContract[M]['reply']>
// Why: the overload fixes each method's reply type; the body only forwards what the host sent.
async function dartCall(
  method: DartMethodName,
  params?: unknown,
  timeoutMs = DART_READ_TIMEOUT_MS
): Promise<unknown> {
  // Why: a host without the capability must be updated; its Dart calls are never sent.
  let supported: boolean
  try {
    supported = await hostSupportsDartProvider()
  } catch (error) {
    // Nothing was sent, so a write is known not to have applied.
    if (DART_WRITE_METHODS.has(method)) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, error: message, outcome: 'notApplied' }
    }
    throw error
  }
  if (!supported) {
    if (method === 'dart.status') {
      throw new DartUpdateRequiredError()
    }
    const failure = { ok: false as const, error: dartUpdateRequiredMessage() }
    return DART_WRITE_METHODS.has(method) ? { ...failure, outcome: 'notApplied' } : failure
  }
  const response = await callRuntimeEnvelope(method, params, timeoutMs)
  if (response.ok) {
    return response.result
  }
  // Same reply as the desktop IPC handlers give for params that fail validation.
  if (response.error.code === 'invalid_argument') {
    const failure = taskProviderFailure('dart.badRequest', response.error.message)
    // Params the host refused were never sent to Dart.
    return DART_WRITE_METHODS.has(method) ? { ...failure, outcome: 'notApplied' } : failure
  }
  throw Object.assign(new Error(response.error.message), { code: response.error.code })
}

export function createWebDartApi(): PreloadApi['dart'] {
  return {
    status: () => dartCall('dart.status'),
    connect: (args) => dartCall('dart.connect', args),
    disconnect: () => dartCall('dart.disconnect', undefined, DART_SETTINGS_TIMEOUT_MS),
    testConnection: () => dartCall('dart.testConnection'),
    config: () => dartCall('dart.config'),
    listTasks: (args) => dartCall('dart.listTasks', args),
    getTask: (args) => dartCall('dart.getTask', args),
    listComments: (args) => dartCall('dart.listComments', args),
    createTask: (args) => dartCall('dart.createTask', args, DART_WRITE_TIMEOUT_MS),
    updateTask: (args) => dartCall('dart.updateTask', args, DART_WRITE_TIMEOUT_MS),
    updateTaskDescription: (args) =>
      dartCall('dart.updateTaskDescription', args, DART_WRITE_TIMEOUT_MS),
    supportsWritesV2,
    addComment: (args) => dartCall('dart.addComment', args, DART_WRITE_TIMEOUT_MS)
  }
}
