import { describe, expect, it } from 'vitest'
import { serializeRemoteRuntimeRpcRequest } from '../../../shared/remote-runtime/remote-runtime-memory-limits'
import type { resolveEnvironment } from '../../../shared/runtime-environment-store'
import { runtimeEnvironmentCallFailure } from './runtime-environment-call-failure'

describe('runtimeEnvironmentCallFailure', () => {
  it('keeps the invalid_argument code of a request the serializer refused as over the host cap', () => {
    let refusal: unknown
    try {
      serializeRemoteRuntimeRpcRequest({
        requestId: crypto.randomUUID(),
        deviceToken: 'dvt_token',
        method: 'dart.createTask',
        params: { description: 'x'.repeat(2 * 1024 * 1024) }
      })
    } catch (error) {
      refusal = error
    }
    // SAFETY: the failure builder reads only runtimeId from the environment.
    const environment = { runtimeId: 'rt-1' } as ReturnType<typeof resolveEnvironment>

    expect(runtimeEnvironmentCallFailure(environment, 'dart.createTask', refusal)).toMatchObject({
      ok: false,
      error: { code: 'invalid_argument' },
      _meta: { runtimeId: 'rt-1' }
    })
  })
})
