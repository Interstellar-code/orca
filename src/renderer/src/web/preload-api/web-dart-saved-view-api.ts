import type { PreloadApi } from '../../../../preload/api-types'
import {
  DART_SAVED_VIEWS_RUNTIME_CAPABILITY,
  DART_SAVED_VIEWS_UPDATE_REQUIRED,
  type DartSavedViewState
} from '../../../../shared/dart/dart-saved-views'
import { callRuntimeResult, getRemoteRuntimeStatus } from './web-runtime-calls'
import { assertActiveEnvironment, requireActiveEnvironment } from './web-runtime-session'

type WebDartSavedViewApi = Required<
  Pick<NonNullable<Partial<PreloadApi>['ui']>, 'getDartSavedViews' | 'mutateDartSavedViews'>
>

const DART_SAVED_VIEWS_TIMEOUT_MS = 15_000

/** Calls the active host only when it advertises the method, so an older host reports "update required" instead of failing generically. */
async function callDartSavedViewMethod(method: string, params?: unknown) {
  const environmentId = requireActiveEnvironment().id
  const status = await getRemoteRuntimeStatus()
  // Why: the capability verdict belongs to the probed host; never send to a host switched in mid-probe.
  assertActiveEnvironment(environmentId)
  if (!status.capabilities?.includes(DART_SAVED_VIEWS_RUNTIME_CAPABILITY)) {
    throw new Error(DART_SAVED_VIEWS_UPDATE_REQUIRED)
  }
  return callRuntimeResult<DartSavedViewState>(method, params, DART_SAVED_VIEWS_TIMEOUT_MS)
}

/** Dart saved views live on the paired host, which is the web client's local execution target. */
export function createWebDartSavedViewApi(): WebDartSavedViewApi {
  return {
    getDartSavedViews: () => callDartSavedViewMethod('ui.getDartSavedViews'),
    mutateDartSavedViews: (mutation) => callDartSavedViewMethod('ui.mutateDartSavedViews', mutation)
  }
}
