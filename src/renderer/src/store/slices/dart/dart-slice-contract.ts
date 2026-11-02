import type { StateCreator } from 'zustand'
import type {
  DartCommentPage,
  DartConnectionStatus,
  DartTask,
  DartTaskPage,
  DartUser,
  DartWorkspaceConfig
} from '../../../../../shared/dart/dart-types'
import type { DartListTasksArgs } from '../../../../../shared/rpc-contract/dart-params'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import type { DartClientResult } from '@/runtime/runtime-dart-client'
import type { CacheEntry } from '../../github/cache-model'
import type { AppState } from '../../types'

export type DartReadOptions = {
  sourceContext?: TaskSourceContext | null
  force?: boolean
}

export type DartSlice = {
  dartStatus: DartConnectionStatus
  dartStatusChecked: boolean
  dartStatusContextKey: string | null
  /** True when the selected remote host lacks `dart.provider.v1`; never falls back to local. */
  dartUpdateRequired: boolean
  dartConnectionRevisions: Record<string, number>
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
}

type DartStateCreator = StateCreator<AppState, [], [], DartSlice>

export type DartSliceSet = Parameters<DartStateCreator>[0]
export type DartSliceGet = Parameters<DartStateCreator>[1]
