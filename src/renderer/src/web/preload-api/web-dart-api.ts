import type { PreloadApi } from '../../../../preload/api-types'
import {
  DART_UNVERIFIED_WRITE_METHODS,
  type DartMethodContract,
  type DartMethodName
} from '../../../../shared/rpc-contract/dart-params'
import { DART_WRITES_V2_RUNTIME_CAPABILITY } from '../../../../shared/dart/dart-capabilities'
import { taskProviderFailure } from '../../../../shared/task-provider-failure'
import { callRuntimeEnvelope, getRemoteRuntimeStatus } from './web-runtime-calls'
import { assertActiveEnvironment, requireActiveEnvironment } from './web-runtime-session'

// The host allows 30s per Dart request; writes may read `/config` twice before the write.
const DART_READ_TIMEOUT_MS = 45_000
const DART_WRITE_TIMEOUT_MS = 100_000
const DART_SETTINGS_TIMEOUT_MS = 15_000

const DART_WRITE_METHODS = new Set<DartMethodName>(DART_UNVERIFIED_WRITE_METHODS)

async function supportsWritesV2(): Promise<boolean> {
  const environmentId = requireActiveEnvironment().id
  const status = await getRemoteRuntimeStatus().catch(() => null)
  // Why: the verdict belongs to the probed host; a host switched in mid-probe is never trusted.
  assertActiveEnvironment(environmentId)
  return status?.capabilities?.includes(DART_WRITES_V2_RUNTIME_CAPABILITY) === true
}

async function dartCall<M extends DartMethodName>(
  method: M,
  params?: DartMethodContract[M]['params'],
  timeoutMs = DART_READ_TIMEOUT_MS
): Promise<DartMethodContract[M]['reply']> {
  const response = await callRuntimeEnvelope<DartMethodContract[M]['reply']>(
    method,
    params,
    timeoutMs
  )
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
