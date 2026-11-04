import type { StateCreator } from 'zustand'
import type {
  DartComment,
  DartCommentPage,
  DartConnectionStatus,
  DartTask,
  DartTaskPage,
  DartUser,
  DartWorkspaceConfig
} from '../../../../../shared/dart/dart-types'
import type {
  DartAddCommentArgs,
  DartCreateTaskArgs,
  DartListTasksArgs,
  DartUpdateTaskDescriptionArgs
} from '../../../../../shared/rpc-contract/dart-params'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import type { DartClientResult } from '@/runtime/runtime-dart-client'
import type { DartFieldUpdates, DartWriteResult } from '@/runtime/runtime-dart-write-client'
import type { CacheEntry } from '../../github/cache-model'
import type { AppState } from '../../types'
import type { DartAccountIdentity, DartTaskIdentity } from './dart-task-identity'

export type DartReadOptions = {
  sourceContext?: TaskSourceContext | null
  force?: boolean
}

export type DartWriteOptions = {
  sourceContext?: TaskSourceContext | null
}

export type DartSlice = {
  dartStatus: DartConnectionStatus
  dartStatusChecked: boolean
  dartStatusContextKey: string | null
  /** True when the selected remote host lacks `dart.provider.v1`; never falls back to local. */
  dartUpdateRequired: boolean
  dartTaskCache: Record<string, CacheEntry<DartTask>>
  dartListCache: Record<string, CacheEntry<DartTaskPage>>
  dartConfigCache: Record<string, CacheEntry<DartWorkspaceConfig>>

  checkDartConnection: () => Promise<void>
  connectDart: (args: { apiToken: string }) => Promise<DartClientResult<{ viewer: DartUser }>>
  testDartConnection: () => Promise<DartClientResult<{ viewer: DartUser }>>
  disconnectDart: () => Promise<DartClientResult<object>>
  fetchDartTask: (
    taskId: string,
    options?: DartReadOptions
  ) => Promise<DartClientResult<{ task: DartTask }>>
  listDartTasks: (
    args?: DartListTasksArgs,
    options?: DartReadOptions
  ) => Promise<DartClientResult<DartTaskPage>>
  listDartComments: (
    taskId: string,
    options?: DartReadOptions
  ) => Promise<DartClientResult<DartCommentPage>>
  fetchDartConfig: (
    options?: DartReadOptions
  ) => Promise<DartClientResult<{ config: DartWorkspaceConfig }>>
  /** Reaches every cached copy under the identity's host and account, whatever alias it is keyed by. */
  patchDartTask: (identity: DartTaskIdentity, patch: Partial<DartTask>) => void
  invalidateDartLists: (identity: DartAccountIdentity) => void
  updateDartTask: (
    taskId: string,
    updates: DartFieldUpdates,
    options?: DartWriteOptions
  ) => Promise<DartWriteResult<{ task: DartTask }>>
  updateDartTaskDescription: (
    args: DartUpdateTaskDescriptionArgs,
    options?: DartWriteOptions
  ) => Promise<DartWriteResult<{ task: DartTask }>>
  addDartComment: (
    args: DartAddCommentArgs,
    options?: DartWriteOptions
  ) => Promise<DartWriteResult<{ comment: DartComment }>>
  createDartTask: (
    args: DartCreateTaskArgs,
    options?: DartWriteOptions
  ) => Promise<DartWriteResult<{ task: DartTask }>>
}

type DartStateCreator = StateCreator<AppState, [], [], DartSlice>

export type DartSliceSet = Parameters<DartStateCreator>[0]
export type DartSliceGet = Parameters<DartStateCreator>[1]
