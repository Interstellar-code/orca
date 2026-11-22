import { beforeEach, describe, expect, it, vi } from 'vitest'

import { callRuntimeRpc } from '../calls/runtime-rpc-call'
import {
  clearRecentRuntimeCompatibilityFailure,
  clearRuntimeCompatibilityCache,
  peekRuntimeEnvironmentCapability
} from './runtime-compatibility-cache'
import { runtimeEnvironmentSupportsCapability } from './runtime-capability-proof'
import {
  MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION,
  RUNTIME_PROTOCOL_VERSION
} from '../../../../../shared/remote-runtime/protocol/protocol-version'

const runtimeCall = vi.fn()
const runtimeEnvironmentCall = vi.fn()
const runtimeEnvironmentSubscribe = vi.fn()

beforeEach(() => {
  clearRuntimeCompatibilityCache()
  runtimeCall.mockReset()
  runtimeEnvironmentCall.mockReset()
  runtimeEnvironmentSubscribe.mockReset()
  vi.stubGlobal('window', {
    api: {
      runtime: { call: runtimeCall },
      runtimeEnvironments: {
        call: runtimeEnvironmentCall,
        subscribe: runtimeEnvironmentSubscribe
      }
    }
  })
})

describe('fresh capability probe', () => {
  const statusResponse = (capabilities: string[], runtimeId = 'remote-runtime') => ({
    id: 'status',
    ok: true,
    result: {
      runtimeId,
      graphStatus: 'ready' as const,
      runtimeProtocolVersion: RUNTIME_PROTOCOL_VERSION,
      minCompatibleRuntimeClientVersion: MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION,
      capabilities
    },
    _meta: { runtimeId }
  })
  const observedStatus = (runtimeId: string) => ({
    ...statusResponse([], runtimeId).result,
    rendererGraphEpoch: 0,
    authoritativeWindowId: null,
    liveTabCount: 0,
    liveLeafCount: 0
  })
  const target = { kind: 'environment', environmentId: 'env-fresh' } as const

  async function proveCompatible(): Promise<void> {
    runtimeEnvironmentCall.mockResolvedValueOnce(statusResponse(['dart.board.v1']))
    runtimeEnvironmentCall.mockResolvedValueOnce({ id: 'warm', ok: true, result: {} })
    await callRuntimeRpc(target, 'github.warm')
    runtimeEnvironmentCall.mockReset()
  }

  it('does not fail a concurrent RPC with prior compatible proof when the fresh probe fails', async () => {
    await proveCompatible()
    let rejectStatus: (error: Error) => void = () => {}
    runtimeEnvironmentCall.mockImplementation(({ method }: { method: string }) =>
      method === 'status.get'
        ? new Promise((_, reject) => {
            rejectStatus = reject
          })
        : Promise.resolve({ id: 'rpc', ok: true, result: { ok: 1 } })
    )

    const probe = runtimeEnvironmentSupportsCapability('env-fresh', 'dart.board.v1', undefined, {
      fresh: true
    })
    const probeOutcome = probe.then(
      () => 'resolved',
      () => 'rejected'
    )
    const concurrent = callRuntimeRpc(target, 'jira.list')
    rejectStatus(new Error('offline'))

    await expect(concurrent).resolves.toEqual({ ok: 1 })
    await expect(probeOutcome).resolves.toBe('rejected')
  })

  it('does not make a non-Dart RPC wait on an in-flight fresh probe', async () => {
    await proveCompatible()
    let resolveStatus: (value: unknown) => void = () => {}
    runtimeEnvironmentCall.mockImplementation(({ method }: { method: string }) =>
      method === 'status.get'
        ? new Promise((resolve) => {
            resolveStatus = resolve
          })
        : Promise.resolve({ id: 'rpc', ok: true, result: { ok: 1 } })
    )

    const probe = runtimeEnvironmentSupportsCapability('env-fresh', 'dart.board.v1', undefined, {
      fresh: true
    })
    await expect(callRuntimeRpc(target, 'linear.list')).resolves.toEqual({ ok: 1 })

    resolveStatus(statusResponse(['dart.board.v1']))
    await expect(probe).resolves.toBe(true)
  })

  it('does not let an older fresh probe overwrite the answer of a newer one', async () => {
    await proveCompatible()
    const resolvers: ((value: unknown) => void)[] = []
    runtimeEnvironmentCall.mockImplementation(
      () => new Promise((resolve) => resolvers.push(resolve))
    )
    const probe = () =>
      runtimeEnvironmentSupportsCapability('env-fresh', 'dart.board.v1', undefined, {
        fresh: true
      })

    const older = probe()
    const newer = probe()
    resolvers[1](statusResponse(['dart.board.v1'], 'runtime-new'))
    await newer
    resolvers[0](statusResponse([], 'runtime-old'))
    await older

    expect(peekRuntimeEnvironmentCapability('env-fresh', 'dart.board.v1', 'runtime-new')).toBe(true)
    expect(
      peekRuntimeEnvironmentCapability('env-fresh', 'dart.board.v1', 'runtime-old')
    ).toBeUndefined()
  })

  it('publishes the newest fresh probe even when an older one resolved before it', async () => {
    await proveCompatible()
    const resolvers: ((value: unknown) => void)[] = []
    runtimeEnvironmentCall.mockImplementation(
      () => new Promise((resolve) => resolvers.push(resolve))
    )
    const probe = () =>
      runtimeEnvironmentSupportsCapability('env-fresh', 'dart.board.v1', undefined, {
        fresh: true
      })

    const first = probe()
    const second = probe()
    resolvers[0](statusResponse(['dart.board.v1'], 'runtime-first'))
    await first
    resolvers[1](statusResponse(['dart.board.v1'], 'runtime-second'))
    await second

    expect(peekRuntimeEnvironmentCapability('env-fresh', 'dart.board.v1', 'runtime-second')).toBe(
      true
    )
  })

  it('does not repopulate an entry a runtime status change cleared while the probe was in flight', async () => {
    await proveCompatible()
    let resolveStatus: (value: unknown) => void = () => {}
    runtimeEnvironmentCall.mockImplementation(
      () => new Promise((resolve) => (resolveStatus = resolve))
    )

    const probe = runtimeEnvironmentSupportsCapability('env-fresh', 'dart.board.v1', undefined, {
      fresh: true
    })
    clearRecentRuntimeCompatibilityFailure('env-fresh', observedStatus('runtime-replacement'))
    resolveStatus(statusResponse(['dart.board.v1'], 'runtime-stale'))
    await expect(probe).resolves.toBe(true)

    expect(
      peekRuntimeEnvironmentCapability('env-fresh', 'dart.board.v1', 'runtime-stale')
    ).toBeUndefined()
  })

  it('does not publish a fresh probe answer when a runtime status was observed on a cold cache meanwhile', async () => {
    let resolveStatus: (value: unknown) => void = () => {}
    runtimeEnvironmentCall.mockImplementation(
      () => new Promise((resolve) => (resolveStatus = resolve))
    )

    const probe = runtimeEnvironmentSupportsCapability('env-fresh', 'dart.board.v1', undefined, {
      fresh: true
    })
    clearRecentRuntimeCompatibilityFailure('env-fresh', observedStatus('runtime-observed'))
    resolveStatus(statusResponse(['dart.board.v1'], 'runtime-stale'))
    await expect(probe).resolves.toBe(true)

    expect(
      peekRuntimeEnvironmentCapability('env-fresh', 'dart.board.v1', 'runtime-stale')
    ).toBeUndefined()
  })

  it('reports a downgraded host as unsupported on the next fresh probe', async () => {
    await proveCompatible()
    runtimeEnvironmentCall.mockResolvedValue(statusResponse([]))

    await expect(
      runtimeEnvironmentSupportsCapability('env-fresh', 'dart.board.v1', undefined, {
        fresh: true
      })
    ).resolves.toBe(false)
  })
})
