import {
  DART_SAVED_VIEWS_RUNTIME_CAPABILITY,
  DART_SAVED_VIEWS_UPDATE_REQUIRED,
  normalizeDartSavedViewState,
  type DartSavedViewMutation,
  type DartSavedViewState
} from '../../../shared/dart/dart-saved-views'
import type { RuntimeClientTarget } from '../../../shared/runtime-client-target'
import { callRuntimeRpc, runtimeEnvironmentSupportsCapability } from './runtime-rpc-client'

const SAVED_VIEWS_TIMEOUT_MS = 15_000

export type DartSavedViewStateResult =
  | { supported: true; state: DartSavedViewState }
  | { supported: false }

const UNSUPPORTED: DartSavedViewStateResult = { supported: false }

async function remoteSupportsSavedViews(environmentId: string): Promise<boolean> {
  return runtimeEnvironmentSupportsCapability(
    environmentId,
    DART_SAVED_VIEWS_RUNTIME_CAPABILITY,
    SAVED_VIEWS_TIMEOUT_MS
  )
}

// Why: the web bridge refuses with this message when the paired host lacks the capability.
async function callLocalBridge(call: () => Promise<unknown>): Promise<DartSavedViewStateResult> {
  try {
    return { supported: true, state: normalizeDartSavedViewState(await call()) }
  } catch (error) {
    if (error instanceof Error && error.message === DART_SAVED_VIEWS_UPDATE_REQUIRED) {
      return UNSUPPORTED
    }
    throw error
  }
}

export async function readDartSavedViewState(
  target: RuntimeClientTarget
): Promise<DartSavedViewStateResult> {
  if (target.kind === 'environment') {
    if (!(await remoteSupportsSavedViews(target.environmentId))) {
      return UNSUPPORTED
    }
    const reply = await callRuntimeRpc(target, 'ui.getDartSavedViews', undefined, {
      timeoutMs: SAVED_VIEWS_TIMEOUT_MS
    })
    return { supported: true, state: normalizeDartSavedViewState(reply) }
  }
  const read = window.api.ui.getDartSavedViews
  if (!read) {
    return UNSUPPORTED
  }
  return callLocalBridge(() => read())
}

export async function mutateDartSavedViews(
  target: RuntimeClientTarget,
  mutation: DartSavedViewMutation
): Promise<DartSavedViewStateResult> {
  if (target.kind === 'environment') {
    if (!(await remoteSupportsSavedViews(target.environmentId))) {
      return UNSUPPORTED
    }
    const reply = await callRuntimeRpc(target, 'ui.mutateDartSavedViews', mutation, {
      timeoutMs: SAVED_VIEWS_TIMEOUT_MS
    })
    return { supported: true, state: normalizeDartSavedViewState(reply) }
  }
  const mutate = window.api.ui.mutateDartSavedViews
  if (!mutate) {
    return UNSUPPORTED
  }
  return callLocalBridge(() => mutate(mutation))
}
