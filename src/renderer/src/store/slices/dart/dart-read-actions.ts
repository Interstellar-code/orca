import type {
  DartCommentPage,
  DartTask,
  DartTaskPage,
  DartWorkspaceConfig
} from '../../../../../shared/dart/dart-types'
import {
  dartConfigForTarget,
  dartGetTaskForTarget,
  dartListCommentsForTarget,
  dartListTasksForTarget,
  type DartClientFailure,
  type DartClientResult
} from '@/runtime/runtime-dart-client'
import type {
  DartOwnedScopeOptions,
  DartReadOptions,
  DartSlice,
  DartSliceGet,
  DartSliceSet
} from './dart-slice-contract'
import { beginDartListRead } from './dart-list-read-version'
import {
  canWriteDartReadResult,
  currentDartMutationGeneration,
  evictDartListCache,
  evictStaleDartCacheEntries,
  dartExplicitScope,
  getDartReadScope,
  isDartAuthLostFailure,
  isFreshDartCacheEntry,
  markDartConnectionLost,
  scopedDartCacheKey,
  type DartReadScope
} from './dart-read-coordination'
import {
  dartAccountIdentity,
  dartScopeViewerId,
  registerDartCacheAlias
} from './dart-task-identity'

type DartReadActions = Pick<
  DartSlice,
  | 'fetchDartTask'
  | 'listDartTasks'
  | 'listDartComments'
  | 'fetchDartConfig'
  | 'readDartSubtasks'
  | 'readDartTasksByIds'
  | 'searchDartTasks'
>

const DART_SUBTASKS_LIMIT = 250
const DART_IDS_PER_READ = 100
const DART_MAX_IDS_READS = 3
const DART_SEARCH_LIMIT = 25

export type InflightDartRead<T extends object> = {
  promise: Promise<DartClientResult<T>>
  mutationGeneration: number
}

const inflightTaskReads = new Map<string, InflightDartRead<{ task: DartTask }>>()
const inflightListReads = new Map<string, InflightDartRead<DartTaskPage>>()
const inflightCommentReads = new Map<string, InflightDartRead<DartCommentPage>>()
const inflightConfigReads = new Map<string, InflightDartRead<{ config: DartWorkspaceConfig }>>()
const inflightIdsReads = new Map<
  string,
  InflightDartRead<{ tasks: DartTask[]; total: number; complete: boolean }>
>()
const inflightSearchReads = new Map<string, InflightDartRead<{ tasks: DartTask[] }>>()

// Transport errors never carry the token; the message is the host's or the client's own text.
function failureFromThrown(error: unknown): DartClientFailure {
  return { ok: false, error: error instanceof Error ? error.message : 'Dart request failed' }
}

// Shares one in-flight request per key, caches only through `store`, and flags a lost connection on auth failures.
export function runDartRead<T extends object>(args: {
  set: DartSliceSet
  get: DartSliceGet
  scope: DartReadScope
  inflightReads: Map<string, InflightDartRead<T>>
  flightKey: string
  force: boolean | undefined
  read: () => Promise<DartClientResult<T>>
  store: (result: { ok: true } & T) => void
}): Promise<DartClientResult<T>> {
  const { set, get, scope, inflightReads, force, read, store } = args
  const mutationGeneration = currentDartMutationGeneration()
  // A default-scope read belongs to the account shown when it started; an explicit scope already names its account.
  const viewerId = scope.explicitSource ? null : dartScopeViewerId(get(), scope)
  const flightKey = JSON.stringify([args.flightKey, viewerId])
  const inflight = inflightReads.get(flightKey)
  if (!force && inflight?.mutationGeneration === mutationGeneration) {
    return inflight.promise
  }
  const promise = read()
    .catch(failureFromThrown)
    .then((result) => {
      if (
        !canWriteDartReadResult(scope, mutationGeneration, get().settings) ||
        (!scope.explicitSource && viewerId !== dartScopeViewerId(get(), scope))
      ) {
        return result
      }
      if (result.ok) {
        store(result)
      } else if (isDartAuthLostFailure(result.errorCode)) {
        markDartConnectionLost(set, scope)
      }
      return result
    })
    .finally(() => {
      if (inflightReads.get(flightKey)?.promise === promise) {
        inflightReads.delete(flightKey)
      }
    })
  inflightReads.set(flightKey, { promise, mutationGeneration })
  return promise
}

function listCacheKey(args: unknown): string {
  return `list::${JSON.stringify(args ?? {})}`
}

function ownedDartReadScope(options: DartOwnedScopeOptions): DartReadScope {
  if (options.scope) {
    return options.scope
  }
  return dartExplicitScope(options.sourceContext)
}

export function createDartReadActions(set: DartSliceSet, get: DartSliceGet): DartReadActions {
  // Shared by the scope-keyed lists and the per-parent children entries: one cache, one patch and invalidation path.
  const readCachedList = async (
    scope: DartReadScope,
    cacheKey: string,
    args: Parameters<DartSlice['listDartTasks']>[0],
    options: DartReadOptions | undefined
  ): Promise<DartClientResult<DartTaskPage>> => {
    const cached = get().dartListCache[cacheKey]
    if (!options?.force && isFreshDartCacheEntry(cached) && cached.data) {
      return { ok: true, ...cached.data }
    }
    const read = beginDartListRead(
      `${scope.contextKey}::${cacheKey}`,
      options?.force,
      dartAccountIdentity(scope, dartScopeViewerId(get(), scope, options?.sourceContext))
    )
    return runDartRead({
      set,
      get,
      scope,
      inflightReads: inflightListReads,
      flightKey: `${scope.contextKey}::${cacheKey}`,
      force: options?.force,
      read: () => dartListTasksForTarget(scope.target, args),
      store: (result) =>
        !read.superseded() &&
        set((state) =>
          evictDartListCache(state, {
            ...state.dartListCache,
            [cacheKey]: {
              data: { tasks: result.tasks, totalCount: result.totalCount },
              // An invalidation during the read leaves the reply stale so the next read fetches.
              fetchedAt: read.invalidated() ? 0 : Date.now()
            }
          })
        )
    })
  }

  return {
    fetchDartTask: async (taskId, options) => {
      const scope = options?.scope ?? getDartReadScope(get().settings, options?.sourceContext)
      if (!options?.scope) {
        registerDartCacheAlias(scope, dartScopeViewerId(get(), scope, options?.sourceContext))
      }
      const cacheKey = scopedDartCacheKey(scope, `task::${taskId}`)
      const cached = get().dartTaskCache[cacheKey]
      if (!options?.force && isFreshDartCacheEntry(cached) && cached.data) {
        return { ok: true, task: cached.data }
      }
      return runDartRead({
        set,
        get,
        scope,
        inflightReads: inflightTaskReads,
        flightKey: `${scope.contextKey}::${cacheKey}`,
        force: options?.force,
        read: () => dartGetTaskForTarget(scope.target, taskId),
        store: (result) =>
          set((state) => ({
            dartTaskCache: evictStaleDartCacheEntries({
              ...state.dartTaskCache,
              [cacheKey]: { data: result.task, fetchedAt: Date.now() }
            })
          }))
      })
    },

    listDartTasks: async (args, options) => {
      const scope = options?.scope ?? getDartReadScope(get().settings, options?.sourceContext)
      registerDartCacheAlias(scope, dartScopeViewerId(get(), scope, options?.sourceContext))
      return readCachedList(scope, scopedDartCacheKey(scope, listCacheKey(args)), args, options)
    },

    readDartSubtasks: async (parentId, options) => {
      const scope = ownedDartReadScope(options)
      registerDartCacheAlias(scope, dartScopeViewerId(get(), scope, options.sourceContext))
      const result = await readCachedList(
        scope,
        scopedDartCacheKey(scope, `list::children::${parentId}`),
        { parentId, limit: DART_SUBTASKS_LIMIT },
        options
      )
      return result.ok ? { ok: true, tasks: result.tasks, total: result.totalCount } : result
    },

    readDartTasksByIds: async (ids, options) => {
      const scope = ownedDartReadScope(options)
      const unique = [...new Set(ids)]
      const readable = unique.slice(0, DART_IDS_PER_READ * DART_MAX_IDS_READS)
      const complete = readable.length === unique.length
      if (unique.length === 0) {
        return { ok: true, tasks: [], total: 0, complete }
      }
      return runDartRead({
        set,
        get,
        scope,
        inflightReads: inflightIdsReads,
        flightKey: `${scope.contextKey}::ids::${unique.join(',')}`,
        force: options.force,
        read: async () => {
          const tasks: DartTask[] = []
          for (let start = 0; start < readable.length; start += DART_IDS_PER_READ) {
            const chunk = readable.slice(start, start + DART_IDS_PER_READ)
            const page = await dartListTasksForTarget(scope.target, {
              ids: chunk,
              limit: chunk.length
            })
            if (!page.ok) {
              return page
            }
            tasks.push(...page.tasks)
          }
          return { ok: true, tasks, total: unique.length, complete }
        },
        store: () => {}
      })
    },

    searchDartTasks: async (text, options) => {
      const scope = ownedDartReadScope(options)
      return runDartRead({
        set,
        get,
        scope,
        inflightReads: inflightSearchReads,
        flightKey: JSON.stringify([scope.contextKey, 'search', text, options.dartboard ?? null]),
        force: false,
        read: async () => {
          const page = await dartListTasksForTarget(scope.target, {
            title: text,
            isCompleted: false,
            limit: DART_SEARCH_LIMIT,
            ...(options.dartboard === undefined ? {} : { dartboard: options.dartboard })
          })
          return page.ok ? { ok: true, tasks: page.tasks } : page
        },
        store: () => {}
      })
    },

    // Comments change while a task is open, so they are never cached across opens.
    listDartComments: async (taskId, options) => {
      const scope = getDartReadScope(get().settings, options?.sourceContext)
      return runDartRead({
        set,
        get,
        scope,
        inflightReads: inflightCommentReads,
        flightKey: `${scope.contextKey}::comments::${taskId}`,
        force: options?.force,
        read: () => dartListCommentsForTarget(scope.target, { taskId }),
        store: () => {}
      })
    },

    fetchDartConfig: async (options) => {
      const scope = getDartReadScope(get().settings, options?.sourceContext)
      const viewerId = dartScopeViewerId(get(), scope, options?.sourceContext)
      registerDartCacheAlias(scope, viewerId)
      const { hostKey, accountKey } = dartAccountIdentity(scope, viewerId)
      const cacheKey = JSON.stringify([hostKey, accountKey, 'config'])
      const cached = get().dartConfigCache[cacheKey]
      if (!options?.force && isFreshDartCacheEntry(cached) && cached.data) {
        return { ok: true, config: cached.data }
      }
      return runDartRead({
        set,
        get,
        scope,
        inflightReads: inflightConfigReads,
        flightKey: JSON.stringify([scope.contextKey, cacheKey]),
        force: options?.force,
        read: () => dartConfigForTarget(scope.target),
        store: (result) =>
          set((state) => ({
            dartConfigCache: evictStaleDartCacheEntries({
              ...state.dartConfigCache,
              [cacheKey]: { data: result.config, fetchedAt: Date.now() }
            })
          }))
      })
    }
  }
}
