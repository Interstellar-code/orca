import { taskProviderFailure } from '../../shared/task-provider-failure'
import type { DartApi } from '../api-types'

// Stub until Lane A wires the main-process Dart client; every call reports "not connected".
async function notConnected(): Promise<ReturnType<typeof taskProviderFailure>> {
  return taskProviderFailure('dart.notConnected', 'Not connected to Dart.')
}

export const dartApi: DartApi = {
  status: notConnected,
  connect: notConnected,
  disconnect: notConnected,
  testConnection: notConnected,
  config: notConnected,
  listTasks: notConnected,
  getTask: notConnected,
  listComments: notConnected,
  createTask: notConnected,
  updateTask: notConnected,
  addComment: notConnected
}
