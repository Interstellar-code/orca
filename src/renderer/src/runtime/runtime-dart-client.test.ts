// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DART_PROVIDER_RUNTIME_CAPABILITY } from '../../../shared/dart/dart-capabilities'
import type { DartTask } from '../../../shared/dart/dart-types'
import {
  dartConnect,
  dartListTasksForTarget,
  dartStatusForTarget,
  DartUpdateRequiredError
} from './runtime-dart-client'
import { createCompatibleRuntimeStatusResponse } from './runtime-compatibility-test-fixture'
import { clearRuntimeCompatibilityCacheForTests } from './runtime-rpc-client'

const dartStatusLocal = vi.fn()
const dartConnectLocal = vi.fn()
const dartListTasksLocal = vi.fn()
const runtimeCall = vi.fn()

const remote = { kind: 'environment', environmentId: 'remote-dart' } as const

function task(overrides: Partial<DartTask>): DartTask {
  return {
    id: 'aB3dE5gH7jK9',
    title: 'Example task',
    htmlUrl: 'https://app.dartai.com/t/aB3dE5gH7jK9-example-task',
    tags: [],
    ...overrides
  }
}

function mockRemote(options: { withDartCapability: boolean; reply?: unknown }): void {
  runtimeCall.mockImplementation(async (args: { method: string }) => {
    if (args.method === 'status.get') {
      const status = createCompatibleRuntimeStatusResponse('remote-dart')
      // The compatible status already advertises every current capability, Dart included.
      const others = (status.result.capabilities ?? []).filter(
        (capability) => capability !== DART_PROVIDER_RUNTIME_CAPABILITY
      )
      status.result.capabilities = options.withDartCapability
        ? [...others, DART_PROVIDER_RUNTIME_CAPABILITY]
        : others
      return status
    }
    return {
      id: 'rpc-result',
      ok: true,
      result: options.reply,
      _meta: { runtimeId: 'remote-dart' }
    }
  })
}

beforeEach(() => {
  clearRuntimeCompatibilityCacheForTests()
  vi.stubGlobal('window', {
    api: {
      dart: {
        status: dartStatusLocal,
        connect: dartConnectLocal,
        listTasks: dartListTasksLocal
      },
      runtimeEnvironments: { call: runtimeCall, subscribe: vi.fn() }
    }
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  dartStatusLocal.mockReset()
  dartConnectLocal.mockReset()
  dartListTasksLocal.mockReset()
  runtimeCall.mockReset()
})

describe('runtime Dart client', () => {
  it('refuses a remote host without dart.provider.v1 and never falls back to the local bridge', async () => {
    mockRemote({ withDartCapability: false })

    await expect(dartStatusForTarget(remote)).rejects.toBeInstanceOf(DartUpdateRequiredError)
    const result = await dartListTasksForTarget(remote, { assigneeId: 'u1' })

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('Update') })
    expect(result.ok === false && result.errorCode).toBeUndefined()
    expect(dartStatusLocal).not.toHaveBeenCalled()
    expect(dartListTasksLocal).not.toHaveBeenCalled()
    expect(runtimeCall.mock.calls.map(([call]) => call.method)).not.toContain('dart.listTasks')
  })

  it('sends the call to the remote host when it advertises dart.provider.v1', async () => {
    mockRemote({
      withDartCapability: true,
      reply: { ok: true, tasks: [task({})], totalCount: 1 }
    })

    const result = await dartListTasksForTarget(remote, { dartboard: 'Example/Platform' })

    expect(result).toMatchObject({ ok: true, totalCount: 1 })
    expect(runtimeCall).toHaveBeenLastCalledWith(
      expect.objectContaining({
        selector: 'remote-dart',
        method: 'dart.listTasks',
        params: { dartboard: 'Example/Platform' }
      })
    )
    expect(dartListTasksLocal).not.toHaveBeenCalled()
  })

  it('blanks a task link that fails the trusted-host check and keeps the task', async () => {
    dartListTasksLocal.mockResolvedValue({
      ok: true,
      totalCount: 2,
      tasks: [
        task({ id: 'aB3dE5gH7jK9' }),
        task({ id: 'zY8xW6vU4tS2', htmlUrl: 'https://evil.example/t/zY8xW6vU4tS2-x' })
      ]
    })

    const result = await dartListTasksForTarget({ kind: 'local' })

    expect(result.ok && result.tasks.map((item) => item.htmlUrl)).toEqual([
      'https://app.dartai.com/t/aB3dE5gH7jK9-example-task',
      ''
    ])
  })

  it('passes a host failure through with its error code', async () => {
    dartConnectLocal.mockResolvedValue({
      ok: false,
      error: 'Dart rejected the API token.',
      errorCode: 'dart.unauthorized'
    })

    await expect(dartConnect({ kind: 'local' }, { apiToken: 'dsa_FAKE' })).resolves.toEqual({
      ok: false,
      error: 'Dart rejected the API token.',
      errorCode: 'dart.unauthorized'
    })
  })

  it('reports a malformed reply as a load failure and a malformed status as disconnected', async () => {
    dartListTasksLocal.mockResolvedValue({ unexpected: true })
    dartStatusLocal.mockResolvedValue(undefined)

    await expect(dartListTasksForTarget({ kind: 'local' })).resolves.toMatchObject({
      ok: false,
      errorCode: 'dart.loadFailed'
    })
    await expect(dartStatusForTarget({ kind: 'local' })).resolves.toEqual({
      connected: false,
      viewer: null
    })
  })
})
