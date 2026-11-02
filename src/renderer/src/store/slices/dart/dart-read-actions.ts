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
  getDartRuntimeTarget,
  type DartClientFailure,
  type DartClientResult
} from '@/runtime/runtime-dart-client'
import type { DartSlice, DartSliceGet, DartSliceSet } from './dart-slice-contract'
import {
  canWriteDartReadResult,
  currentDartMutationGeneration,
  evictStaleDartCacheEntries,
  getDartReadScope,
  isDartAuthLostFailure,
  isFreshDartCacheEntry,
  markDartConnectionLost,
  scopedDartCacheKey,
  type DartReadScope
} from './dart-read-coordination'

type DartReadActions = Pick<
  DartSlice,
  'fetchDartTask' | 'listDartTasks' | 'listDartComments' | 'fetchDartConfig'
>

type InflightDartRead<T extends object> = {
  promise: Promise<DartClientResult<T>>
  mutationGeneration: number
}

const inflightTaskReads = new Map<string, InflightDartRead<{ task: DartTask }>>()
const inflightListReads = new Map<string, InflightDartRead<DartTaskPage>>()
const inflightCommentReads = new Map<string, InflightDartRead<DartCommentPage>>()
const inflightConfigReads = new Map<string, InflightDartRead<{ config: DartWorkspaceConfig }>>()

// Transport errors never carry the token; the message is the host's or the client's own text.
function failureFromThrown(error: unknown): DartClientFailure {
  return { ok: false, error: error instanceof Error ? error.message : 'Dart request failed' }
}

// Shares one in-flight request per key, caches only through `store`, and flags a lost connection on auth failures.
function runDartRead<T extends object>(args: {
  set: DartSliceSet
  get: DartSliceGet
  scope: DartReadScope
  inflightReads: Map<string, InflightDartRead<T>>
  flightKey: string
  force: boolean | undefined
  read: () => Promise<DartClientResult<T>>
  store: (result: { ok: true } & T) => void
}): Promise<DartClientResult<T>> {
  const { set, get, scope, inflightReads, flightKey, force, read, store } = args
  const mutationGeneration = currentDartMutationGeneration()
  const inflight = inflightReads.get(flightKey)
  if (!force && inflight?.mutationGeneration === mutationGeneration) {
    return inflight.promise
  }
  const promise = read()
    .catch(failureFromThrown)
    .then((result) => {
      if (!canWriteDartReadResult(scope, mutationGeneration, get().settings)) {
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

export function createDartReadActions(set: DartSliceSet, get: DartSliceGet): DartReadActions {
  return {
    fetchDartTask: async (taskId, options) => {
      const scope = getDartReadScope(get().settings, options?.sourceContext)
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
        read: () => dartGetTaskForTarget(getDartRuntimeTarget(scope.settings), taskId),
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
      const scope = getDartReadScope(get().settings, options?.sourceContext)
      const cacheKey = scopedDartCacheKey(scope, listCacheKey(args))
      const cached = get().dartListCache[cacheKey]
      if (!options?.force && isFreshDartCacheEntry(cached) && cached.data) {
        return { ok: true, ...cached.data }
      }
      return runDartRead({
        set,
        get,
        scope,
        inflightReads: inflightListReads,
        flightKey: `${scope.contextKey}::${cacheKey}`,
        force: options?.force,
        read: () => dartListTasksForTarget(getDartRuntimeTarget(scope.settings), args),
        store: (result) =>
          set((state) => ({
            dartListCache: evictStaleDartCacheEntries({
              ...state.dartListCache,
              [cacheKey]: {
                data: { tasks: result.tasks, totalCount: result.totalCount },
                fetchedAt: Date.now()
              }
            })
          }))
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
        read: () => dartListCommentsForTarget(getDartRuntimeTarget(scope.settings), { taskId }),
        store: () => {}
      })
    },

    fetchDartConfig: async (options) => {
      const scope = getDartReadScope(get().settings, options?.sourceContext)
      const cacheKey = scopedDartCacheKey(scope, 'config')
      const cached = get().dartConfigCache[cacheKey]
      if (!options?.force && isFreshDartCacheEntry(cached) && cached.data) {
        return { ok: true, config: cached.data }
      }
      return runDartRead({
        set,
        get,
        scope,
        inflightReads: inflightConfigReads,
        flightKey: `${scope.contextKey}::${cacheKey}`,
        force: options?.force,
        read: () => dartConfigForTarget(getDartRuntimeTarget(scope.settings)),
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
