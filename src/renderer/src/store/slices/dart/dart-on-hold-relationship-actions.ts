import type { DartRelationshipCacheEntry } from '@/components/task-page/dart/dart-board-contracts'
import type { DartSlice, DartSliceGet, DartSliceSet } from './dart-slice-contract'
import {
  currentDartConnectionGeneration,
  getDartReadScope,
  isCurrentDartRuntimeContext,
  isDartAuthLostFailure
} from './dart-read-coordination'
import {
  dartScopeViewerId,
  dartTaskIdentity,
  dartTaskIdentityKey,
  registerDartCacheAlias
} from './dart-task-identity'

export const DART_ON_HOLD_READ_CAP = 20

const NOT_CHECKED: DartRelationshipCacheEntry = {
  state: 'notChecked',
  relationships: null,
  fetchedAt: 0,
  error: null
}

export function createDartOnHoldRelationshipActions(
  set: DartSliceSet,
  get: DartSliceGet
): Pick<DartSlice, 'readDartOnHoldRelationships'> {
  return {
    readDartOnHoldRelationships: async (taskIds) => {
      const scope = getDartReadScope(get().settings)
      const viewerId = dartScopeViewerId(get(), scope)
      registerDartCacheAlias(scope, viewerId)
      const connectionGeneration = currentDartConnectionGeneration()
      const isCurrent = (): boolean =>
        connectionGeneration === currentDartConnectionGeneration() &&
        isCurrentDartRuntimeContext(scope.contextKey, get().settings)
      const keyOf = (taskId: string): string =>
        dartTaskIdentityKey(dartTaskIdentity(scope, taskId, viewerId))
      const unique = [...new Set(taskIds)]
      const targets = unique.slice(0, DART_ON_HOLD_READ_CAP)
      // Past the cap is "not checked", never "not blocked"; an existing entry is kept.
      set((state) => {
        const next = { ...state.dartRelationshipCache }
        for (const taskId of unique) {
          const key = keyOf(taskId)
          const entry = next[key]
          if (targets.includes(taskId)) {
            next[key] = { ...(entry ?? NOT_CHECKED), state: 'loading', error: null }
          } else if (!entry) {
            next[key] = NOT_CHECKED
          }
        }
        return { dartRelationshipCache: next }
      })
      for (const taskId of targets) {
        if (!isCurrent()) {
          return
        }
        // Forced, so every read set sees fresh blockers; the detail's task cache gets the same task.
        const result = await get()
          .fetchDartTask(taskId, { scope, force: true })
          .catch((error: unknown) => ({
            ok: false as const,
            error: error instanceof Error ? error.message : 'Dart request failed',
            errorCode: undefined
          }))
        if (!isCurrent()) {
          return
        }
        const entry: DartRelationshipCacheEntry = result.ok
          ? {
              // No links data is unknown, not "no blockers".
              state: result.task.relationships ? 'known' : 'notChecked',
              relationships: result.task.relationships ?? null,
              fetchedAt: Date.now(),
              error: null
            }
          : { state: 'error', relationships: null, fetchedAt: Date.now(), error: result.error }
        set((state) => ({
          dartRelationshipCache: { ...state.dartRelationshipCache, [keyOf(taskId)]: entry }
        }))
        if (!result.ok && isDartAuthLostFailure(result.errorCode)) {
          return
        }
      }
    }
  }
}
