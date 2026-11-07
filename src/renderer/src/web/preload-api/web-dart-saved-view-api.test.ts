import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getRemoteRuntimeStatus: vi.fn(),
  callRuntimeResult: vi.fn(),
  requireActiveEnvironment: vi.fn(),
  assertActiveEnvironment: vi.fn()
}))

vi.mock('./web-runtime-calls', () => ({
  getRemoteRuntimeStatus: mocks.getRemoteRuntimeStatus,
  callRuntimeResult: mocks.callRuntimeResult
}))
vi.mock('./web-runtime-session', () => ({
  requireActiveEnvironment: mocks.requireActiveEnvironment,
  assertActiveEnvironment: mocks.assertActiveEnvironment
}))

import {
  DART_SAVED_VIEWS_RUNTIME_CAPABILITY,
  DART_SAVED_VIEWS_UPDATE_REQUIRED
} from '../../../../shared/dart/dart-saved-views'
import { createWebDartSavedViewApi } from './web-dart-saved-view-api'

const STATE = { views: [], activeViewId: null }

beforeEach(() => {
  vi.resetAllMocks()
  mocks.requireActiveEnvironment.mockReturnValue({ id: 'env-1' })
})

describe('web dart saved view api', () => {
  it('reports update-required and sends no request to a host without the capability', async () => {
    mocks.getRemoteRuntimeStatus.mockResolvedValue({ capabilities: [] })
    const api = createWebDartSavedViewApi()
    await expect(api.getDartSavedViews()).rejects.toThrow(DART_SAVED_VIEWS_UPDATE_REQUIRED)
    await expect(api.mutateDartSavedViews({ kind: 'select', id: null })).rejects.toThrow(
      DART_SAVED_VIEWS_UPDATE_REQUIRED
    )
    expect(mocks.callRuntimeResult).not.toHaveBeenCalled()
  })

  it('reads and mutates through the host RPC methods when advertised', async () => {
    mocks.getRemoteRuntimeStatus.mockResolvedValue({
      capabilities: [DART_SAVED_VIEWS_RUNTIME_CAPABILITY]
    })
    mocks.callRuntimeResult.mockResolvedValue(STATE)
    const api = createWebDartSavedViewApi()
    const mutation = { kind: 'delete', id: 'v1' } as const

    await expect(api.getDartSavedViews()).resolves.toEqual(STATE)
    await expect(api.mutateDartSavedViews(mutation)).resolves.toEqual(STATE)

    expect(mocks.callRuntimeResult).toHaveBeenNthCalledWith(
      1,
      'ui.getDartSavedViews',
      undefined,
      expect.any(Number)
    )
    expect(mocks.callRuntimeResult).toHaveBeenNthCalledWith(
      2,
      'ui.mutateDartSavedViews',
      mutation,
      expect.any(Number)
    )
  })

  it('does not trust a capability verdict for a host switched in mid-probe', async () => {
    mocks.getRemoteRuntimeStatus.mockResolvedValue({
      capabilities: [DART_SAVED_VIEWS_RUNTIME_CAPABILITY]
    })
    mocks.assertActiveEnvironment.mockImplementation(() => {
      throw new Error('environment changed')
    })
    await expect(createWebDartSavedViewApi().getDartSavedViews()).rejects.toThrow(
      'environment changed'
    )
    expect(mocks.callRuntimeResult).not.toHaveBeenCalled()
  })
})
