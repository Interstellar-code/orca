import type { GlobalSettings } from '../../../../../shared/global-settings-types'
import type { RuntimeClientTarget } from '../../../../../shared/runtime-client-target'
import {
  getTaskSourceCacheScope,
  type TaskSourceContext
} from '../../../../../shared/task-source-context'
import type { DartConnectionStatus, DartTaskPage } from '../../../../../shared/dart/dart-types'
import type { DartScopeMeta } from '@/components/task-page/dart/dart-board-contracts'
import { defaultScopeHost } from '@/lib/default-creation-host'
import {
  getEnvironmentRuntimeContextKey,
  getProviderRuntimeContextKey,
  runtimeEnvironmentIdFromContextKey
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
let dartConnectionGeneration = 0

export const EMPTY_DART_READ_CACHES = {
  dartTaskCache: {},
  dartListCache: {},
  dartConfigCache: {},
  dartRelationshipCache: {},
  dartScopeMetaCache: {},
  dartMountedScopeKey: null
} satisfies Partial<DartSlice>

export function isFreshDartCacheEntry<T>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> {
  return entry !== undefined && Date.now() - entry.fetchedAt < CACHE_TTL
}

/** `keep` holds keys that survive eviction whatever their age, such as a just-patched entry with `fetchedAt: 0`. */
export function evictStaleDartCacheEntries<T>(
  cache: Record<string, CacheEntry<T>>,
  keep?: ReadonlySet<string>
): Record<string, CacheEntry<T>> {
  const keys = Object.keys(cache)
  if (keys.length <= MAX_CACHE_ENTRIES) {
    return cache
  }
  const kept = keys.filter((key) => keep?.has(key))
  const rest = keys
    .filter((key) => !keep?.has(key))
    .sort((a, b) => (cache[a]?.fetchedAt ?? 0) - (cache[b]?.fetchedAt ?? 0))
  const newest = rest.slice(rest.length - (MAX_CACHE_ENTRIES - kept.length))
  return Object.fromEntries([...kept, ...newest].map((key) => [key, cache[key]]))
}

/** Metadata outlives no list entry, except the mounted key, which can hold a read that published no rows. */
export function pruneDartScopeMetaCache(
  metaCache: Record<string, DartScopeMeta>,
  listCache: Record<string, CacheEntry<DartTaskPage>>,
  mountedKey: string | null
): Record<string, DartScopeMeta> {
  const entries = Object.entries(metaCache)
  const kept = entries.filter(([key]) => key in listCache || key === mountedKey)
  return kept.length === entries.length ? metaCache : Object.fromEntries(kept)
}

/** An expanded parent's children must not be evicted by scope reads. */
const CHILDREN_LIST_KEY_MARKER = '::list::children::'

/** The mounted scope entry and children entries keep their slots even when a patch marked them stale. */
export function evictDartListCache(
  state: Pick<DartSlice, 'dartMountedScopeKey' | 'dartScopeMetaCache'>,
  listCache: Record<string, CacheEntry<DartTaskPage>>
): Pick<DartSlice, 'dartListCache' | 'dartScopeMetaCache'> {
  const keep = new Set([
    ...(state.dartMountedScopeKey ? [state.dartMountedScopeKey] : []),
    ...Object.keys(listCache).filter((key) => key.includes(CHILDREN_LIST_KEY_MARKER))
  ])
  const dartListCache = evictStaleDartCacheEntries(listCache, keep)
  return {
    dartListCache,
    dartScopeMetaCache: pruneDartScopeMetaCache(
      state.dartScopeMetaCache,
      dartListCache,
      state.dartMountedScopeKey
    )
  }
}

/** Stops older reads from caching; a task write stops only this, never a status check or a connect in progress. */
export function beginDartMutation(): number {
  dartMutationGeneration += 1
  return dartMutationGeneration
}

/** A credential change supersedes status reads and earlier connection requests, and every read in flight. */
export function beginDartConnectionChange(): number {
  beginDartMutation()
  dartConnectionGeneration += 1
  return dartConnectionGeneration
}

export function currentDartConnectionGeneration(): number {
  return dartConnectionGeneration
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

export function isCurrentDartConnectionChange(generation: number): boolean {
  return generation === dartConnectionGeneration
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
  return dartExplicitScope(sourceContext)
}

/** A source row names its own host and account, so no setting is read. */
export function dartExplicitScope(sourceContext: TaskSourceContext): DartReadScope {
  const cachePrefix = getTaskSourceCacheScope(sourceContext)
  const target = taskSourceRuntimeTarget(sourceContext)
  return {
    contextKey: `${getEnvironmentRuntimeContextKey(runtimeTargetEnvironmentId(target))}::${cachePrefix}`,
    cachePrefix,
    explicitSource: true,
    target
  }
}

/** The default scope for a page whose already-read context key names its host, so UI never re-reads the setting. */
export function dartPageScopeFromContextKey(pageContextKey: string): DartReadScope {
  const environmentId = runtimeEnvironmentIdFromContextKey(pageContextKey)
  return {
    contextKey: pageContextKey,
    cachePrefix: null,
    explicitSource: false,
    target: environmentId ? { kind: 'environment', environmentId } : { kind: 'local' }
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

/** The one place a viewer is installed: a viewer that differs from the host's last seen one drops its scope entries, whichever host is shown. */
export function dartStatusUpdate(
  state: Pick<
    AppState,
    | 'dartStatus'
    | 'dartStatusContextKey'
    | 'dartLastSeenViewers'
    | 'dartListCache'
    | 'dartScopeMetaCache'
    | 'dartMountedScopeKey'
  >,
  contextKey: string,
  status: DartConnectionStatus,
  extra?: Partial<DartSlice>
): Partial<DartSlice> {
  const nextViewer = status.viewer?.id ?? null
  const lastSeen =
    state.dartLastSeenViewers[contextKey] ??
    (state.dartStatusContextKey === contextKey ? (state.dartStatus.viewer?.id ?? null) : undefined)
  return {
    dartStatus: status,
    dartStatusChecked: true,
    dartStatusContextKey: contextKey,
    dartUpdateRequired: false,
    dartLastSeenViewers: { ...state.dartLastSeenViewers, [contextKey]: nextViewer },
    ...(lastSeen !== undefined && lastSeen !== nextViewer
      ? dropDartScopeCachesForHost(state, contextKey)
      : undefined),
    ...extra
  }
}

export function isDartAuthLostFailure(errorCode: string | undefined): boolean {
  return errorCode === 'dart.unauthorized' || errorCode === 'dart.notConnected'
}

/** A new account on the same host must not see or patch the previous account's scope entries. */
export function dropDartScopeCachesForHost(
  state: Pick<DartSlice, 'dartListCache' | 'dartScopeMetaCache' | 'dartMountedScopeKey'>,
  contextKey: string
): Pick<DartSlice, 'dartListCache' | 'dartScopeMetaCache' | 'dartMountedScopeKey'> {
  const prefix = `${contextKey}::list::scope::`
  const childrenPrefix = `${contextKey}${CHILDREN_LIST_KEY_MARKER}`
  const keep = <T>(cache: Record<string, T>): Record<string, T> =>
    Object.fromEntries(
      Object.entries(cache).filter(
        ([key]) => !key.startsWith(prefix) && !key.startsWith(childrenPrefix)
      )
    )
  return {
    dartListCache: keep(state.dartListCache),
    dartScopeMetaCache: keep(state.dartScopeMetaCache),
    dartMountedScopeKey: state.dartMountedScopeKey?.startsWith(prefix)
      ? null
      : state.dartMountedScopeKey
  }
}
