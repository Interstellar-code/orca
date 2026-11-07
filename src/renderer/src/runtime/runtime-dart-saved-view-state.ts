import {
  DART_SAVED_VIEWS_RUNTIME_CAPABILITY,
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
  if (!window.api.ui.getDartSavedViews) {
    return UNSUPPORTED
  }
  return {
    supported: true,
    state: normalizeDartSavedViewState(await window.api.ui.getDartSavedViews())
  }
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
  if (!window.api.ui.mutateDartSavedViews) {
    return UNSUPPORTED
  }
  return {
    supported: true,
    state: normalizeDartSavedViewState(await window.api.ui.mutateDartSavedViews(mutation))
  }
}
