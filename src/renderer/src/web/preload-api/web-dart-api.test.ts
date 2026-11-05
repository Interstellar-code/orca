import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getRemoteRuntimeStatus: vi.fn(),
  callRuntimeEnvelope: vi.fn(),
  requireActiveEnvironment: vi.fn(),
  assertActiveEnvironment: vi.fn()
}))

vi.mock('./web-runtime-calls', () => ({
  getRemoteRuntimeStatus: mocks.getRemoteRuntimeStatus,
  callRuntimeEnvelope: mocks.callRuntimeEnvelope
}))
vi.mock('./web-runtime-session', () => ({
  requireActiveEnvironment: mocks.requireActiveEnvironment,
  assertActiveEnvironment: mocks.assertActiveEnvironment
}))

import { createWebDartApi } from './web-dart-api'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.requireActiveEnvironment.mockReturnValue({ id: 'env-1' })
})

describe('web dart supportsWritesV2', () => {
  it('is true when the host advertises dart.writes.v2', async () => {
    mocks.getRemoteRuntimeStatus.mockResolvedValue({
      capabilities: ['dart.provider.v1', 'dart.writes.v2']
    })
    await expect(createWebDartApi().supportsWritesV2()).resolves.toBe(true)
    expect(mocks.assertActiveEnvironment).toHaveBeenCalledWith('env-1')
  })

  it('is false for a host with only dart.provider.v1 or no capability list', async () => {
    mocks.getRemoteRuntimeStatus.mockResolvedValue({ capabilities: ['dart.provider.v1'] })
    await expect(createWebDartApi().supportsWritesV2()).resolves.toBe(false)
    mocks.getRemoteRuntimeStatus.mockResolvedValue({})
    await expect(createWebDartApi().supportsWritesV2()).resolves.toBe(false)
  })

  it('is false when the probe fails', async () => {
    mocks.getRemoteRuntimeStatus.mockRejectedValue(new Error('offline'))
    await expect(createWebDartApi().supportsWritesV2()).resolves.toBe(false)
  })

  it('does not trust a verdict for a host switched in mid-probe', async () => {
    mocks.getRemoteRuntimeStatus.mockResolvedValue({ capabilities: ['dart.writes.v2'] })
    mocks.assertActiveEnvironment.mockImplementation(() => {
      throw new Error('environment changed')
    })
    await expect(createWebDartApi().supportsWritesV2()).rejects.toThrow('environment changed')
  })
})

describe('web dart status capability gate', () => {
  it('throws update-required and sends no Dart request to a host without dart.provider.v1', async () => {
    mocks.getRemoteRuntimeStatus.mockResolvedValue({ capabilities: [] })
    await expect(createWebDartApi().status()).rejects.toMatchObject({
      name: 'DartUpdateRequiredError'
    })
    expect(mocks.callRuntimeEnvelope).not.toHaveBeenCalled()
  })

  it('sends dart.status to a host with dart.provider.v1', async () => {
    mocks.getRemoteRuntimeStatus.mockResolvedValue({ capabilities: ['dart.provider.v1'] })
    mocks.callRuntimeEnvelope.mockResolvedValue({ ok: true, result: { ok: true } })
    await createWebDartApi().status()
    expect(mocks.callRuntimeEnvelope).toHaveBeenCalledWith('dart.status', undefined, 45_000)
  })
})

describe('web dart writes', () => {
  it('sends the description patch with the write timeout', async () => {
    mocks.callRuntimeEnvelope.mockResolvedValue({ ok: true, result: { ok: true } })
    const args = {
      taskId: 'abcDEF123456',
      updates: [{ type: 'delete' as const, oldText: 'a' }]
    }
    await createWebDartApi().updateTaskDescription(args)
    expect(mocks.callRuntimeEnvelope).toHaveBeenCalledWith(
      'dart.updateTaskDescription',
      args,
      100_000
    )
  })

  it('reports host-refused write params as notApplied but leaves reads alone', async () => {
    mocks.callRuntimeEnvelope.mockResolvedValue({
      ok: false,
      error: { code: 'invalid_argument', message: 'bad' }
    })
    const api = createWebDartApi()
    await expect(api.addComment({ taskId: 'abcDEF123456', text: 'x' })).resolves.toMatchObject({
      errorCode: 'dart.badRequest',
      outcome: 'notApplied'
    })
    expect(await api.getTask({ taskId: 'abcDEF123456' })).not.toHaveProperty('outcome')
  })
})
