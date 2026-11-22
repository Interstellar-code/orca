import { DART_PROVIDER_RUNTIME_CAPABILITY } from '../../shared/dart/dart-capabilities'
import type { RuntimeStatus } from '../../shared/remote-runtime/session-graph/runtime-session-contracts'
import type { HandlerContext } from '../dispatch/dispatch'
import { RuntimeClientError } from '../runtime/connection/types'

/** Every `orca dart` command refuses a host older than the Dart provider, as Jira's gate does. */
export async function requireDartRuntime(context: HandlerContext): Promise<void> {
  const runtime = await context.client.call<RuntimeStatus>('status.get')
  if (!runtime.result.capabilities?.includes(DART_PROVIDER_RUNTIME_CAPABILITY)) {
    throw new RuntimeClientError(
      'incompatible_runtime',
      'Update Orca on the execution host to use Dart.'
    )
  }
}
