import { shallow } from 'zustand/shallow'
import {
  dartConnectForTarget,
  dartDisconnectForTarget,
  dartStatusForTarget,
  dartTestConnectionForTarget,
  DartUpdateRequiredError,
  type DartClientFailure
} from '@/runtime/runtime-dart-client'
import { translate } from '@/i18n/i18n'
import type { DartSlice, DartSliceGet, DartSliceSet } from './dart-slice-contract'
import {
  beginDartConnectionChange,
  currentDartConnectionGeneration,
  dartStatusUpdate,
  EMPTY_DART_READ_CACHES,
  getDartReadScope,
  isCurrentDartConnectionChange,
  isCurrentDartRuntimeContext,
  isCurrentDartStatusRead,
  nextDartStatusReadGeneration
} from './dart-read-coordination'

type DartConnectionActions = Pick<
  DartSlice,
  'checkDartConnection' | 'connectDart' | 'testDartConnection' | 'disconnectDart'
>

const DISCONNECTED = { connected: false, viewer: null } as const

function hasDartStatusChanged(previous: DartSlice['dartStatus'], next: DartSlice['dartStatus']) {
  return (
    previous.connected !== next.connected ||
    previous.credentialError !== next.credentialError ||
    previous.credentialProtection !== next.credentialProtection ||
    !shallow(previous.viewer, next.viewer)
  )
}

// Transport errors never carry the token; the message is the host's or the client's own text.
function failureFromThrown(error: unknown, fallback: string): DartClientFailure {
  return { ok: false, error: error instanceof Error ? error.message : fallback }
}

export function createDartConnectionActions(
  set: DartSliceSet,
  get: DartSliceGet
): DartConnectionActions {
  return {
    checkDartConnection: async () => {
      const scope = getDartReadScope(get().settings)
      const contextKey = scope.contextKey
      const statusReadGeneration = nextDartStatusReadGeneration()
      const connectionGeneration = currentDartConnectionGeneration()
      if (get().dartStatusContextKey !== contextKey) {
        set({ dartStatusChecked: false, dartUpdateRequired: false })
      }
      const isStale = (): boolean =>
        connectionGeneration !== currentDartConnectionGeneration() ||
        !isCurrentDartStatusRead(statusReadGeneration) ||
        !isCurrentDartRuntimeContext(contextKey, get().settings)
      try {
        const status = await dartStatusForTarget(scope.target)
        if (isStale()) {
          return
        }
        if (
          get().dartStatusContextKey !== contextKey ||
          get().dartUpdateRequired ||
          hasDartStatusChanged(get().dartStatus, status)
        ) {
          set((state) =>
            dartStatusUpdate(
              state,
              contextKey,
              status,
              state.dartStatus.viewer?.id !== status.viewer?.id
                ? { dartConfigCache: {} }
                : undefined
            )
          )
        } else if (!get().dartStatusChecked) {
          set({ dartStatusChecked: true, dartStatusContextKey: contextKey })
        }
      } catch (error) {
        if (isStale()) {
          return
        }
        if (error instanceof DartUpdateRequiredError) {
          set((state) => ({
            ...dartStatusUpdate(state, contextKey, DISCONNECTED),
            dartUpdateRequired: true
          }))
        } else if (get().dartStatusContextKey !== contextKey) {
          set((state) => dartStatusUpdate(state, contextKey, DISCONNECTED))
        } else if (!get().dartStatusChecked) {
          set({ dartStatusChecked: true })
        }
        // A transient failure on an already-checked context keeps the last known status.
      }
    },

    connectDart: async (args) => {
      const requestGeneration = beginDartConnectionChange()
      const scope = getDartReadScope(get().settings)
      const contextKey = scope.contextKey
      try {
        const result = await dartConnectForTarget(scope.target, args)
        if (!result.ok) {
          return result
        }
        if (
          !isCurrentDartConnectionChange(requestGeneration) ||
          !isCurrentDartRuntimeContext(contextKey, get().settings)
        ) {
          // The host already stored the token; refresh whichever context is current.
          void get().checkDartConnection()
          return {
            ok: false,
            error: translate(
              'taskProviders.dart.connectSuperseded',
              'Dart connection was superseded by a newer request.'
            )
          }
        }
        set((state) =>
          dartStatusUpdate(
            state,
            contextKey,
            { connected: true, viewer: result.viewer },
            EMPTY_DART_READ_CACHES
          )
        )
        void get().checkDartConnection()
        return result
      } catch (error) {
        return failureFromThrown(error, 'Connection failed')
      }
    },

    testDartConnection: async () => {
      const requestGeneration = beginDartConnectionChange()
      const scope = getDartReadScope(get().settings)
      const contextKey = scope.contextKey
      try {
        const result = await dartTestConnectionForTarget(scope.target)
        if (
          !isCurrentDartConnectionChange(requestGeneration) ||
          !isCurrentDartRuntimeContext(contextKey, get().settings)
        ) {
          return result
        }
        const status = await dartStatusForTarget(scope.target)
        if (
          isCurrentDartConnectionChange(requestGeneration) &&
          isCurrentDartRuntimeContext(contextKey, get().settings)
        ) {
          set((state) => dartStatusUpdate(state, contextKey, status))
        }
        return result
      } catch (error) {
        return failureFromThrown(error, 'Test failed')
      }
    },

    disconnectDart: async () => {
      const requestGeneration = beginDartConnectionChange()
      const scope = getDartReadScope(get().settings)
      const contextKey = scope.contextKey
      try {
        const result = await dartDisconnectForTarget(scope.target)
        if (
          !result.ok ||
          !isCurrentDartConnectionChange(requestGeneration) ||
          !isCurrentDartRuntimeContext(contextKey, get().settings)
        ) {
          return result
        }
        const status = await dartStatusForTarget(scope.target)
        if (
          isCurrentDartConnectionChange(requestGeneration) &&
          isCurrentDartRuntimeContext(contextKey, get().settings)
        ) {
          set((state) =>
            dartStatusUpdate(
              state,
              contextKey,
              status.connected ? status : DISCONNECTED,
              EMPTY_DART_READ_CACHES
            )
          )
        }
        return result
      } catch (error) {
        return failureFromThrown(error, 'Disconnect failed')
      }
    }
  }
}
