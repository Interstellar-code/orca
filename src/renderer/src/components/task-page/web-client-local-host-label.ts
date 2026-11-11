import { isWebClientLocation } from '@/lib/web-client-location'
import { readStoredWebRuntimeEnvironment } from '@/web/web-runtime-environment'

/** In a paired web client the local host is the server, so it takes the pairing's name, not the browser's OS. */
export function getWebClientLocalHostLabel(): string | undefined {
  if (!isWebClientLocation()) {
    return undefined
  }
  try {
    return readStoredWebRuntimeEnvironment()?.name?.trim() || undefined
  } catch {
    // Blocked storage keeps the default label rather than breaking the Tasks page.
    return undefined
  }
}
