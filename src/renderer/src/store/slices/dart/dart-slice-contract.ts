import type { StateCreator } from 'zustand'
import type {
  DartComment,
  DartCommentPage,
  DartConnectionStatus,
  DartHostFeatures,
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
import type {
  DartRelationshipCacheEntry,
  DartScopeMeta,
  DartScopeReadResult,
  DartServerFilters
} from '@/components/task-page/dart/dart-board-contracts'
import type { CacheEntry } from '../../github/cache-model'
import type { AppState } from '../../types'
import type { DartReadScope } from './dart-read-coordination'
import type { DartAccountIdentity, DartTaskIdentity } from './dart-task-identity'

export type DartReadOptions = {
  sourceContext?: TaskSourceContext | null
  /** A scope the caller resolved earlier (its alias is already registered), so the call never re-resolves the host from settings. */
  scope?: DartReadScope
  force?: boolean
}

export type DartWriteOptions = {
  sourceContext?: TaskSourceContext | null
  /** A scope the caller resolved earlier (its alias is already registered), so the call never re-resolves the host from settings. */
  scope?: DartReadScope
}

/** Board reads; `DartSlice` includes it together with the implementations. */
export type DartScopeReadSlice = {
  dartScopeMetaCache: Record<string, DartScopeMeta>
  /** The list key `publishDartScope` last wrote; evictions keep it. */
  dartMountedScopeKey: string | null
  /** Read-only: reads the open pages and the first finished page, writes no cache. The viewer id comes from `dartStatus`. */
  readDartScope: (
    serverFilters: DartServerFilters,
    options: { features: DartHostFeatures; scope: DartReadScope }
  ) => Promise<DartScopeReadResult>
  publishDartScope: (
    serverFilters: DartServerFilters,
    outcome: { result: DartScopeReadResult; current: boolean; scope: DartReadScope }
  ) => void
  /** Re-mount reuse (D3.7): when the scope entry for these filters is still fresh, marks it mounted and returns true; no read. */
  mountDartScope: (serverFilters: DartServerFilters, scope: DartReadScope) => boolean
  /** Reads the next 50 finished tasks by `doneOffset`; the viewer id comes from `dartStatus`. */
  readMoreDone: (
    serverFilters: DartServerFilters,
    options: { features: DartHostFeatures; scope: DartReadScope }
  ) => Promise<DartClientResult<object>>
}

export type DartSlice = DartScopeReadSlice & {
  dartStatus: DartConnectionStatus
  dartStatusChecked: boolean
  dartStatusContextKey: string | null
  /** Last viewer id each host's status showed (null: none), so a changed account is seen even while another host is shown. */
  dartLastSeenViewers: Record<string, string | null>
  /** True when the selected remote host lacks `dart.provider.v1`; never falls back to local. */
  dartUpdateRequired: boolean
  dartTaskCache: Record<string, CacheEntry<DartTask>>
  dartListCache: Record<string, CacheEntry<DartTaskPage>>
  dartConfigCache: Record<string, CacheEntry<DartWorkspaceConfig>>
  /** On-hold tasks' blocker state, keyed by `dartTaskIdentityKey`; never expires, emptied on connect and disconnect. */
  dartRelationshipCache: Record<string, DartRelationshipCacheEntry>

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
  /** Stores the children entry under `list::children::<parentId>` (D13.4); up to 250 rows. */
  readDartSubtasks: (
    parentId: string,
    options?: DartReadOptions
  ) => Promise<DartClientResult<{ tasks: DartTask[]; total: number }>>
  /** 100 ids per read, at most 3 reads, not cached; `complete` is false when ids were left unread. */
  readDartTasksByIds: (
    ids: readonly string[],
    options?: DartReadOptions
  ) => Promise<DartClientResult<{ tasks: DartTask[]; total: number; complete: boolean }>>
  /** Not cached: title search over open tasks, 25 rows, optionally one dartboard. */
  searchDartTasks: (
    text: string,
    options: { sourceContext?: TaskSourceContext | null; dartboard?: string }
  ) => Promise<DartClientResult<{ tasks: DartTask[] }>>
  /** Default scope; reads `getTask` one after another for the first 20 ids, outside the epoch window. */
  readDartOnHoldRelationships: (taskIds: readonly string[]) => Promise<void>
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
  setDartTaskBlockers: (
    taskId: string,
    blockerIds: readonly string[],
    options?: DartWriteOptions
  ) => Promise<DartWriteResult<{ task: DartTask }>>
}

type DartStateCreator = StateCreator<AppState, [], [], DartSlice>

export type DartSliceSet = Parameters<DartStateCreator>[0]
export type DartSliceGet = Parameters<DartStateCreator>[1]
