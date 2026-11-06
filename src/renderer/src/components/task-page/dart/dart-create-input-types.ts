import type {
  DartConnectionStatus,
  DartTask,
  DartWorkspaceConfig
} from '../../../../../shared/dart/dart-types'
import type { DartListFilters } from './task-page-dart-list-model'

export type TaskPageDartCreationInput = {
  providerRuntimeContextKey: string
  taskSource?: string
  dartConnected: boolean
  dartUpdateRequired: boolean
  dartConfig: DartWorkspaceConfig | null
  dartConfigError?: string | null
  dartFilters: DartListFilters
  dartStatus: DartConnectionStatus
  setDartRefreshNonce: (updater: (nonce: number) => number) => void
  noteDartTaskCreated: (task: DartTask) => void
  openDartDetailPage: (task: DartTask) => void
}

export type DartCreateExtras = Partial<{
  createFieldsLocked: boolean
  accountChecking: boolean
  retryAccountCheck(): Promise<void>
  claimCreateMatch(task: DartTask): void
  createWritesV2Pending: boolean
  createTokenRejected: boolean
}>
