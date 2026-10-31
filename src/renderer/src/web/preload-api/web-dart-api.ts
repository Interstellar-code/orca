import type { PreloadApi } from '../../../../preload/api-types'
import type {
  DartMethodContract,
  DartMethodName
} from '../../../../shared/rpc-contract/dart-params'
import { taskProviderFailure } from '../../../../shared/task-provider-failure'
import { callRuntimeEnvelope } from './web-runtime-calls'

// The host allows 30s per Dart request; writes may read `/config` twice before the write.
const DART_READ_TIMEOUT_MS = 45_000
const DART_WRITE_TIMEOUT_MS = 100_000
const DART_SETTINGS_TIMEOUT_MS = 15_000

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
    return taskProviderFailure('dart.badRequest', response.error.message)
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
    addComment: (args) => dartCall('dart.addComment', args, DART_WRITE_TIMEOUT_MS)
  }
}
