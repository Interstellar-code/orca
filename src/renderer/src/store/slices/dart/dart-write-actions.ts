import {
  dartAddCommentForTarget,
  dartCreateTaskForTarget,
  dartUpdateTaskDescriptionForTarget,
  dartUpdateTaskForTarget,
  type DartWriteResult
} from '@/runtime/runtime-dart-write-client'
import { translate } from '@/i18n/i18n'
import type { DartSlice, DartSliceGet, DartSliceSet } from './dart-slice-contract'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import {
  beginDartMutation,
  currentDartConnectionGeneration,
  getDartReadScope,
  isDartAuthLostFailure,
  isDartScopeOnPageHost,
  type DartReadScope
} from './dart-read-coordination'
import {
  bumpDartEpochs,
  dartAccountIdentity,
  dartScopeViewerId,
  dartTaskIdentity,
  registerDartCacheAlias
} from './dart-task-identity'

type DartWriteActions = Pick<
  DartSlice,
  'updateDartTask' | 'updateDartTaskDescription' | 'addDartComment' | 'createDartTask'
>

// Resolves the scope once, so a host switch mid-write cannot redirect it, and flags a lost connection only on the page's host.
async function runDartWrite<T extends object>(args: {
  set: DartSliceSet
  get: DartSliceGet
  sourceContext: TaskSourceContext | null | undefined
  send: (scope: DartReadScope, viewerId: string | null) => Promise<DartWriteResult<T>>
}): Promise<DartWriteResult<T>> {
  const { set, get, sourceContext, send } = args
  const scope = getDartReadScope(get().settings, sourceContext)
  const viewerId = dartScopeViewerId(get(), scope, sourceContext)
  registerDartCacheAlias(scope, viewerId)
  const connectionGeneration = currentDartConnectionGeneration()
  let result: DartWriteResult<T>
  try {
    result = await send(scope, viewerId)
  } catch (error) {
    // Nothing proves a thrown write did not land.
    result = {
      ok: false,
      outcome: 'unknown',
      error:
        error instanceof Error
          ? error.message
          : translate('auto.store.slices.dart.requestFailed', 'Dart request failed')
    }
  }
  if (
    !result.ok &&
    isDartAuthLostFailure(result.errorCode) &&
    isDartScopeOnPageHost(scope, get().settings) &&
    // A 401 for the old token says nothing about a connection made while the write was in flight.
    connectionGeneration === currentDartConnectionGeneration()
  ) {
    set({ dartStatus: { connected: false, viewer: null } })
  }
  return result
}

/** Field and description edits go through the write queue, which owns optimism, epochs and invalidation. */
export function createDartWriteActions(set: DartSliceSet, get: DartSliceGet): DartWriteActions {
  return {
    updateDartTask: (taskId, updates, options) =>
      runDartWrite({
        set,
        get,
        sourceContext: options?.sourceContext,
        send: (scope) => dartUpdateTaskForTarget(scope.target, taskId, updates)
      }),

    updateDartTaskDescription: (args, options) =>
      runDartWrite({
        set,
        get,
        sourceContext: options?.sourceContext,
        send: (scope) => dartUpdateTaskDescriptionForTarget(scope.target, args)
      }),

    addDartComment: (args, options) =>
      runDartWrite({
        set,
        get,
        sourceContext: options?.sourceContext,
        send: async (scope, viewerId) => {
          const identity = dartTaskIdentity(scope, args.taskId, viewerId)
          bumpDartEpochs(identity)
          try {
            return await dartAddCommentForTarget(scope.target, args)
          } finally {
            bumpDartEpochs(identity)
          }
        }
      }),

    createDartTask: (args, options) =>
      runDartWrite({
        set,
        get,
        sourceContext: options?.sourceContext,
        send: async (scope, viewerId) => {
          beginDartMutation()
          // A throw or an unknown create may have landed, so a page cached before it can no longer be trusted.
          let mayHaveLanded = true
          try {
            const result = await dartCreateTaskForTarget(scope.target, args)
            mayHaveLanded = result.ok || result.outcome === 'unknown'
            return result
          } finally {
            beginDartMutation()
            if (mayHaveLanded) {
              get().invalidateDartLists(dartAccountIdentity(scope, viewerId))
            }
          }
        }
      })
  }
}
