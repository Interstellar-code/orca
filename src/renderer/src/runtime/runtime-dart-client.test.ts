// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DART_BOARD_RUNTIME_CAPABILITY,
  DART_PROVIDER_RUNTIME_CAPABILITY,
  DART_RELATIONSHIPS_RUNTIME_CAPABILITY
} from '../../../shared/dart/dart-capabilities'
import type { DartTask } from '../../../shared/dart/dart-types'
import {
  dartBoardFeaturesForTarget,
  dartConnectForTarget,
  dartListTasksForTarget,
  dartStatusForTarget,
  DartUpdateRequiredError
} from './runtime-dart-client'
import { createCompatibleRuntimeStatusResponse } from './runtime-compatibility-test-fixture'
import { clearRuntimeCompatibilityCacheForTests } from './runtime-rpc-client'

const dartStatusLocal = vi.fn()
const dartConnectLocal = vi.fn()
const dartListTasksLocal = vi.fn()
const supportedDartFeaturesLocal = vi.fn()
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

function mockRemote(options: {
  withDartCapability: boolean
  withRelationships?: boolean
  reply?: unknown
}): void {
  runtimeCall.mockImplementation(async (args: { method: string; params: unknown }) => {
    if (args.method === 'status.get') {
      const status = createCompatibleRuntimeStatusResponse('remote-dart')
      // The compatible status already advertises every current capability, Dart included.
      const others = (status.result.capabilities ?? []).filter(
        (capability) => capability !== DART_PROVIDER_RUNTIME_CAPABILITY
      )
      const withProvider = options.withDartCapability
        ? [...others, DART_PROVIDER_RUNTIME_CAPABILITY]
        : others
      status.result.capabilities =
        options.withRelationships === false
          ? withProvider.filter(
              (capability) => capability !== DART_RELATIONSHIPS_RUNTIME_CAPABILITY
            )
          : withProvider
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

function mockRemoteFeatureCapabilities(advertised: {
  board: boolean
  relationships?: boolean
}): void {
  runtimeCall.mockImplementation(async () => {
    const status = createCompatibleRuntimeStatusResponse('remote-dart')
    const others = (status.result.capabilities ?? []).filter(
      (capability) =>
        capability !== DART_BOARD_RUNTIME_CAPABILITY &&
        capability !== DART_RELATIONSHIPS_RUNTIME_CAPABILITY
    )
    status.result.capabilities = [
      ...others,
      ...(advertised.board ? [DART_BOARD_RUNTIME_CAPABILITY] : []),
      ...(advertised.relationships ? [DART_RELATIONSHIPS_RUNTIME_CAPABILITY] : [])
    ]
    return status
  })
}

beforeEach(() => {
  clearRuntimeCompatibilityCacheForTests()
  vi.stubGlobal('window', {
    api: {
      dart: {
        status: dartStatusLocal,
        connect: dartConnectLocal,
        listTasks: dartListTasksLocal,
        supportedDartFeatures: supportedDartFeaturesLocal
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
  supportedDartFeaturesLocal.mockReset()
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

    await expect(
      dartConnectForTarget({ kind: 'local' }, { apiToken: 'dsa_FAKE' })
    ).resolves.toEqual({
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

  it('sends order and offset to the local bridge and returns raw counts intact', async () => {
    const raw = { rowCount: 3, totalCount: 9 }
    dartListTasksLocal.mockResolvedValue({
      ok: true,
      totalCount: 9,
      tasks: [task({}), task({ id: 'zY8xW6vU4tS2' })],
      raw
    })

    const result = await dartListTasksForTarget(
      { kind: 'local' },
      { order: '-updated_at', offset: 20 }
    )

    expect(dartListTasksLocal).toHaveBeenCalledWith({ order: '-updated_at', offset: 20 })
    expect(result).toMatchObject({ ok: true, raw })
  })

  it('sends order and offset to the remote RPC and returns raw counts intact', async () => {
    const raw = { rowCount: 2, totalCount: 5 }
    mockRemote({
      withDartCapability: true,
      reply: { ok: true, tasks: [task({})], totalCount: 5, raw }
    })

    const result = await dartListTasksForTarget(remote, { order: 'title', offset: 10 })

    expect(runtimeCall).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: 'dart.listTasks',
        params: { order: 'title', offset: 10 }
      })
    )
    expect(result).toMatchObject({ ok: true, raw })
  })

  describe('parentId and ids', () => {
    const IDS = ['aB3dE5gH7jK9', 'zY8xW6vU4tS2']

    it('passes parentId and ids to a remote host that advertises dart.relationships.v1', async () => {
      mockRemote({
        withDartCapability: true,
        reply: { ok: true, tasks: [task({})], totalCount: 1 }
      })

      await dartListTasksForTarget(remote, { parentId: 'pQ4rS6tU8vW0', limit: 250 })
      expect(runtimeCall).toHaveBeenLastCalledWith(
        expect.objectContaining({
          method: 'dart.listTasks',
          params: { parentId: 'pQ4rS6tU8vW0', limit: 250 }
        })
      )

      await dartListTasksForTarget(remote, { ids: IDS })
      expect(runtimeCall).toHaveBeenLastCalledWith(
        expect.objectContaining({ method: 'dart.listTasks', params: { ids: IDS } })
      )
    })

    it('refuses without sending them to a remote host without dart.relationships.v1', async () => {
      mockRemote({ withDartCapability: true, withRelationships: false })

      const results = [
        await dartListTasksForTarget(remote, { parentId: 'pQ4rS6tU8vW0' }),
        await dartListTasksForTarget(remote, { ids: IDS })
      ]

      for (const result of results) {
        expect(result).toMatchObject({ ok: false, error: expect.stringContaining('Update') })
      }
      expect(runtimeCall.mock.calls.map(([call]) => call.method)).not.toContain('dart.listTasks')
    })

    it('still reads without them on a host without the capability', async () => {
      mockRemote({
        withDartCapability: true,
        withRelationships: false,
        reply: { ok: true, tasks: [task({})], totalCount: 1 }
      })

      await expect(dartListTasksForTarget(remote, { limit: 100 })).resolves.toMatchObject({
        ok: true
      })
    })

    it('asks the local bridge for support and sends nothing without it', async () => {
      supportedDartFeaturesLocal.mockResolvedValue({ board: true })

      await expect(
        dartListTasksForTarget({ kind: 'local' }, { parentId: 'pQ4rS6tU8vW0' })
      ).resolves.toMatchObject({ ok: false })
      expect(dartListTasksLocal).not.toHaveBeenCalled()

      supportedDartFeaturesLocal.mockResolvedValue({ board: true, relationships: true })
      dartListTasksLocal.mockResolvedValue({ ok: true, tasks: [], totalCount: 0 })
      await dartListTasksForTarget({ kind: 'local' }, { parentId: 'pQ4rS6tU8vW0' })
      expect(dartListTasksLocal).toHaveBeenCalledWith({ parentId: 'pQ4rS6tU8vW0' })
    })
  })
})

describe('dartBoardFeaturesForTarget', () => {
  it('reports board support from the remote host capability', async () => {
    mockRemoteFeatureCapabilities({ board: true, relationships: true })
    await expect(dartBoardFeaturesForTarget(remote)).resolves.toEqual({
      board: true,
      relationships: true
    })

    clearRuntimeCompatibilityCacheForTests()
    mockRemoteFeatureCapabilities({ board: true })
    await expect(dartBoardFeaturesForTarget(remote)).resolves.toEqual({
      board: true,
      relationships: false
    })

    clearRuntimeCompatibilityCacheForTests()
    mockRemoteFeatureCapabilities({ board: false })
    await expect(dartBoardFeaturesForTarget(remote)).resolves.toEqual({
      board: false,
      relationships: false
    })
    expect(supportedDartFeaturesLocal).not.toHaveBeenCalled()
  })

  it('re-probes a remote host within the capability cache window: a downgraded host reports no board', async () => {
    mockRemoteFeatureCapabilities({ board: true })
    await expect(dartBoardFeaturesForTarget(remote)).resolves.toMatchObject({ board: true })

    mockRemoteFeatureCapabilities({ board: false })
    await expect(dartBoardFeaturesForTarget(remote)).resolves.toMatchObject({ board: false })
  })

  it('asks the local bridge for a local target', async () => {
    supportedDartFeaturesLocal.mockResolvedValue({ board: true, relationships: true })

    await expect(dartBoardFeaturesForTarget({ kind: 'local' })).resolves.toEqual({
      board: true,
      relationships: true
    })
    expect(runtimeCall).not.toHaveBeenCalled()
  })

  it('does not cache a result: a later upgrade is seen', async () => {
    supportedDartFeaturesLocal.mockResolvedValueOnce({ board: false })
    supportedDartFeaturesLocal.mockResolvedValueOnce({ board: true })

    await expect(dartBoardFeaturesForTarget({ kind: 'local' })).resolves.toEqual({ board: false })
    await expect(dartBoardFeaturesForTarget({ kind: 'local' })).resolves.toEqual({ board: true })
  })

  it('treats a rejecting probe, a failing remote probe and an old preload as no board', async () => {
    supportedDartFeaturesLocal.mockRejectedValue(new Error('environment changed'))
    await expect(dartBoardFeaturesForTarget({ kind: 'local' })).resolves.toEqual({ board: false })

    runtimeCall.mockRejectedValue(new Error('offline'))
    await expect(dartBoardFeaturesForTarget(remote)).resolves.toEqual({ board: false })

    vi.stubGlobal('window', { api: { dart: {} } })
    await expect(dartBoardFeaturesForTarget({ kind: 'local' })).resolves.toEqual({ board: false })
  })
})
