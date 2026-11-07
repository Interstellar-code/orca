// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DART_SAVED_VIEWS_RUNTIME_CAPABILITY,
  DART_SAVED_VIEWS_UPDATE_REQUIRED,
  type DartSavedView,
  type DartSavedViewMutation
} from '../../../shared/dart/dart-saved-views'
import { createCompatibleRuntimeStatusResponse } from './runtime-compatibility-test-fixture'
import { mutateDartSavedViews, readDartSavedViewState } from './runtime-dart-saved-view-state'
import { clearRuntimeCompatibilityCacheForTests } from './runtime-rpc-client'

const getLocal = vi.fn()
const mutateLocal = vi.fn()
const runtimeCall = vi.fn()

const remote = { kind: 'environment', environmentId: 'remote-dart' } as const

const view: DartSavedView = {
  id: 'view-1',
  name: 'Mine in progress',
  filters: {
    mine: true,
    status: 'Doing',
    dartboard: null,
    search: '',
    tag: null,
    priority: null,
    onHold: false
  },
  layout: 'board',
  showEmptyColumns: true
}
const state = { views: [view], activeViewId: 'view-1' }
const saveMutation: DartSavedViewMutation = { kind: 'save', view }

function mockRemote(options: {
  withSavedViews: boolean
  reply?: unknown
  rejectCallWith?: Error
}): void {
  runtimeCall.mockImplementation(async (args: { method: string; params: unknown }) => {
    if (args.method === 'status.get') {
      const status = createCompatibleRuntimeStatusResponse('remote-dart')
      const others = (status.result.capabilities ?? []).filter(
        (capability) => capability !== DART_SAVED_VIEWS_RUNTIME_CAPABILITY
      )
      status.result.capabilities = options.withSavedViews
        ? [...others, DART_SAVED_VIEWS_RUNTIME_CAPABILITY]
        : others
      return status
    }
    if (options.rejectCallWith) {
      throw options.rejectCallWith
    }
    return {
      id: 'rpc-result',
      ok: true,
      result: options.reply,
      _meta: { runtimeId: 'remote-dart' }
    }
  })
}

function rpcMethods(): string[] {
  return runtimeCall.mock.calls.map(([call]) => call.method)
}

beforeEach(() => {
  clearRuntimeCompatibilityCacheForTests()
  vi.stubGlobal('window', {
    api: {
      ui: { getDartSavedViews: getLocal, mutateDartSavedViews: mutateLocal },
      runtimeEnvironments: { call: runtimeCall, subscribe: vi.fn() }
    }
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  getLocal.mockReset()
  mutateLocal.mockReset()
  runtimeCall.mockReset()
})

describe('Dart saved view state client', () => {
  it('reads and mutates through the local bridge and normalizes the reply', async () => {
    getLocal.mockResolvedValue(state)
    mutateLocal.mockResolvedValue({ views: [view], activeViewId: 'gone' })

    await expect(readDartSavedViewState({ kind: 'local' })).resolves.toEqual({
      supported: true,
      state
    })
    await expect(mutateDartSavedViews({ kind: 'local' }, saveMutation)).resolves.toEqual({
      supported: true,
      state: { views: [view], activeViewId: null }
    })
    expect(mutateLocal).toHaveBeenCalledWith(saveMutation)
    expect(runtimeCall).not.toHaveBeenCalled()
  })

  it('reads and mutates on a remote host with dart.savedViews.v1 using the ui RPC methods', async () => {
    mockRemote({ withSavedViews: true, reply: state })

    await expect(readDartSavedViewState(remote)).resolves.toEqual({ supported: true, state })
    expect(runtimeCall).toHaveBeenLastCalledWith(
      expect.objectContaining({ selector: 'remote-dart', method: 'ui.getDartSavedViews' })
    )

    const selectMutation: DartSavedViewMutation = { kind: 'select', id: 'view-1' }
    await expect(mutateDartSavedViews(remote, selectMutation)).resolves.toEqual({
      supported: true,
      state
    })
    expect(runtimeCall).toHaveBeenLastCalledWith(
      expect.objectContaining({
        selector: 'remote-dart',
        method: 'ui.mutateDartSavedViews',
        params: selectMutation
      })
    )
  })

  it('reports unsupported for a remote host without the capability and sends no ui call', async () => {
    mockRemote({ withSavedViews: false, reply: state })

    await expect(readDartSavedViewState(remote)).resolves.toEqual({ supported: false })
    await expect(mutateDartSavedViews(remote, saveMutation)).resolves.toEqual({
      supported: false
    })
    expect(rpcMethods()).not.toContain('ui.getDartSavedViews')
    expect(rpcMethods()).not.toContain('ui.mutateDartSavedViews')
    expect(getLocal).not.toHaveBeenCalled()
    expect(mutateLocal).not.toHaveBeenCalled()
  })

  it('reports unsupported when the local bridge lacks the methods', async () => {
    vi.stubGlobal('window', { api: { ui: {} } })

    await expect(readDartSavedViewState({ kind: 'local' })).resolves.toEqual({ supported: false })
    await expect(mutateDartSavedViews({ kind: 'local' }, saveMutation)).resolves.toEqual({
      supported: false
    })
  })

  it('reports unsupported when the web bridge refuses with the update-required message', async () => {
    getLocal.mockRejectedValue(new Error(DART_SAVED_VIEWS_UPDATE_REQUIRED))
    mutateLocal.mockRejectedValue(new Error(DART_SAVED_VIEWS_UPDATE_REQUIRED))

    await expect(readDartSavedViewState({ kind: 'local' })).resolves.toEqual({ supported: false })
    await expect(mutateDartSavedViews({ kind: 'local' }, saveMutation)).resolves.toEqual({
      supported: false
    })
  })

  it('still throws other local bridge errors from read and mutate', async () => {
    getLocal.mockRejectedValue(new Error('boom'))
    mutateLocal.mockRejectedValue(new Error('A view with that name already exists.'))

    await expect(readDartSavedViewState({ kind: 'local' })).rejects.toThrow('boom')
    await expect(mutateDartSavedViews({ kind: 'local' }, saveMutation)).rejects.toThrow(
      'already exists'
    )
  })

  it('propagates a host refusal from a local or remote mutate', async () => {
    mutateLocal.mockRejectedValue(new Error('A view with that name already exists.'))
    await expect(mutateDartSavedViews({ kind: 'local' }, saveMutation)).rejects.toThrow(
      'already exists'
    )

    mockRemote({
      withSavedViews: true,
      rejectCallWith: new Error('A view with that name already exists.')
    })
    await expect(mutateDartSavedViews(remote, saveMutation)).rejects.toThrow('already exists')
  })
})
