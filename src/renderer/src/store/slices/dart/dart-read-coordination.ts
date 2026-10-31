import type { GlobalSettings } from '../../../../../shared/global-settings-types'
import {
  getTaskSourceCacheScope,
  getTaskSourceRuntimeSettings,
  type TaskSourceContext
} from '../../../../../shared/task-source-context'
import type { DartConnectionStatus } from '../../../../../shared/dart/dart-types'
import { defaultScopeSource, type RowLessSource } from '@/lib/default-creation-host'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import type { CacheEntry } from '../../github/cache-model'
import type { AppState } from '../../types'
import type { DartSlice, DartSliceSet } from './dart-slice-contract'

const CACHE_TTL = 60_000
const MAX_CACHE_ENTRIES = 300

export type DartReadScope = {
  contextKey: string
  cachePrefix: string | null
  explicitSource: boolean
  settings: RowLessSource
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

export function getDartReadScope(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  sourceContext?: TaskSourceContext | null
): DartReadScope {
  if (!sourceContext) {
    return {
      contextKey: getProviderRuntimeContextKey(settings),
      cachePrefix: null,
      explicitSource: false,
      settings: defaultScopeSource(settings)
    }
  }
  const cachePrefix = getTaskSourceCacheScope(sourceContext)
  return {
    contextKey: `${getProviderRuntimeContextKey(getTaskSourceRuntimeSettings(sourceContext))}::${cachePrefix}`,
    cachePrefix,
    explicitSource: true,
    settings: sourceContext
  }
}

// Pure key for a task read through an explicit source row; it must match what `fetchDartTask` stores.
export function dartTaskCacheKey(sourceContext: TaskSourceContext, taskId: string): string {
  return `${getTaskSourceCacheScope(sourceContext)}::task::${taskId}`
}

export function scopedDartCacheKey(scope: DartReadScope, key: string): string {
  return scope.cachePrefix ? `${scope.cachePrefix}::${key}` : key
}

function nextDartConnectionRevisions(
  revisions: Record<string, number>,
  contextKey: string
): Record<string, number> {
  return { ...revisions, [contextKey]: (revisions[contextKey] ?? 0) + 1 }
}

export function markDartConnectionLost(set: DartSliceSet, scope: DartReadScope): void {
  set((state) => ({
    ...(scope.explicitSource ? {} : { dartStatus: { connected: false, viewer: null } }),
    dartConnectionRevisions: nextDartConnectionRevisions(
      state.dartConnectionRevisions,
      scope.contextKey
    )
  }))
}

export function dartStatusUpdate(
  state: AppState,
  contextKey: string,
  status: DartConnectionStatus,
  extra?: Partial<DartSlice>
): Partial<DartSlice> {
  return {
    dartStatus: status,
    dartStatusChecked: true,
    dartStatusContextKey: contextKey,
    dartUpdateRequired: false,
    dartConnectionRevisions: nextDartConnectionRevisions(state.dartConnectionRevisions, contextKey),
    ...extra
  }
}

export function isDartAuthLostFailure(errorCode: string | undefined): boolean {
  return errorCode === 'dart.unauthorized' || errorCode === 'dart.notConnected'
}
