import type { GlobalSettings } from '../../../../../shared/global-settings-types'
import type { RuntimeClientTarget } from '../../../../../shared/runtime-client-target'
import {
  getTaskSourceCacheScope,
  type TaskSourceContext
} from '../../../../../shared/task-source-context'
import type { DartConnectionStatus } from '../../../../../shared/dart/dart-types'
import { defaultScopeHost } from '@/lib/default-creation-host'
import {
  getEnvironmentRuntimeContextKey,
  getProviderRuntimeContextKey
} from '@/lib/provider-runtime-context'
import { taskSourceRuntimeTarget } from '@/lib/task-source-runtime-target'
import { getRuntimeTargetHostId, runtimeTargetEnvironmentId } from '@/runtime/runtime-client-target'
import type { CacheEntry } from '../../github/cache-model'
import type { AppState } from '../../types'
import type { DartSlice, DartSliceSet } from './dart-slice-contract'

const CACHE_TTL = 60_000
const MAX_CACHE_ENTRIES = 300

export type DartReadScope = {
  contextKey: string
  cachePrefix: string | null
  explicitSource: boolean
  /** Resolved once per action so a read never resolves the host from settings again. */
  target: RuntimeClientTarget
}

let dartStatusReadGeneration = 0
let dartMutationGeneration = 0

export const EMPTY_DART_READ_CACHES = {
  dartTaskCache: {},
  dartListCache: {},
  dartConfigCache: {}
} satisfies Partial<DartSlice>

export function isFreshDartCacheEntry<T>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> {
  return entry !== undefined && Date.now() - entry.fetchedAt < CACHE_TTL
}

export function evictStaleDartCacheEntries<T>(
  cache: Record<string, CacheEntry<T>>
): Record<string, CacheEntry<T>> {
  const keys = Object.keys(cache)
  if (keys.length <= MAX_CACHE_ENTRIES) {
    return cache
  }
  const newest = keys
    .sort((a, b) => (cache[a]?.fetchedAt ?? 0) - (cache[b]?.fetchedAt ?? 0))
    .slice(keys.length - MAX_CACHE_ENTRIES)
  return Object.fromEntries(newest.map((key) => [key, cache[key]]))
}

export function beginDartMutation(): number {
  dartMutationGeneration += 1
  return dartMutationGeneration
}

export function currentDartMutationGeneration(): number {
  return dartMutationGeneration
}

export function nextDartStatusReadGeneration(): number {
  dartStatusReadGeneration += 1
  return dartStatusReadGeneration
}

export function isCurrentDartStatusRead(generation: number): boolean {
  return generation === dartStatusReadGeneration
}

export function isCurrentDartMutation(generation: number): boolean {
  return generation === dartMutationGeneration
}

export function isCurrentDartRuntimeContext(
  contextKey: string,
  settings: AppState['settings']
): boolean {
  return getProviderRuntimeContextKey(settings) === contextKey
}

export function canWriteDartReadResult(
  scope: DartReadScope,
  mutationGeneration: number,
  settings: AppState['settings']
): boolean {
  return (
    mutationGeneration === dartMutationGeneration &&
    (scope.explicitSource || isCurrentDartRuntimeContext(scope.contextKey, settings))
  )
}

/** Both branches key on the resolved target, whose host is the one the settings name. */
export function getDartReadScope(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  sourceContext?: TaskSourceContext | null
): DartReadScope {
  if (!sourceContext) {
    const target = defaultScopeHost(settings)
    return {
      contextKey: getEnvironmentRuntimeContextKey(runtimeTargetEnvironmentId(target)),
      cachePrefix: null,
      explicitSource: false,
      target
    }
  }
  const cachePrefix = getTaskSourceCacheScope(sourceContext)
  const target = taskSourceRuntimeTarget(sourceContext)
  return {
    contextKey: `${getEnvironmentRuntimeContextKey(runtimeTargetEnvironmentId(target))}::${cachePrefix}`,
    cachePrefix,
    explicitSource: true,
    target
  }
}

// Pure key for a task read through an explicit source row; it must match what `fetchDartTask` stores.
export function dartTaskCacheKey(sourceContext: TaskSourceContext, taskId: string): string {
  return `${getTaskSourceCacheScope(sourceContext)}::task::${taskId}`
}

export function scopedDartCacheKey(scope: DartReadScope, key: string): string {
  // A default-scope read is keyed by its host so a local and a remote account never share cached rows.
  return `${scope.cachePrefix ?? scope.contextKey}::${key}`
}

export function markDartConnectionLost(set: DartSliceSet, scope: DartReadScope): void {
  if (scope.explicitSource) {
    return
  }
  set({ dartStatus: { connected: false, viewer: null } })
}

/** The page's status belongs to its host's token, so any scope on that host can prove it lost. */
export function isDartScopeOnPageHost(
  scope: Pick<DartReadScope, 'target'>,
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined
): boolean {
  return getRuntimeTargetHostId(scope.target) === getRuntimeTargetHostId(defaultScopeHost(settings))
}

export function dartStatusUpdate(
  _state: AppState,
  contextKey: string,
  status: DartConnectionStatus,
  extra?: Partial<DartSlice>
): Partial<DartSlice> {
  return {
    dartStatus: status,
    dartStatusChecked: true,
    dartStatusContextKey: contextKey,
    dartUpdateRequired: false,
    ...extra
  }
}

export function isDartAuthLostFailure(errorCode: string | undefined): boolean {
  return errorCode === 'dart.unauthorized' || errorCode === 'dart.notConnected'
}
