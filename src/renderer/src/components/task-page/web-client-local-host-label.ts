import { isWebClientLocation } from '@/lib/web-client-location'
import { readStoredWebRuntimeEnvironment } from '@/web/web-runtime-environment'

/** In a paired web client the local host is the server, not the browser's machine. */
export function withWebClientLocalHostLabel(
  labels: ReadonlyMap<string, string>
): ReadonlyMap<string, string> {
  if (!isWebClientLocation()) {
    return labels
  }
  const name = readStoredWebRuntimeEnvironment()?.name?.trim()
  if (!name) {
    return labels
  }
  return new Map([...labels, ['local', name]])
}
