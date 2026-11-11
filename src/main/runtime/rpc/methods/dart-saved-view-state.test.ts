import { MOBILE_RPC_METHOD_ROUTES } from '../../runtime-rpc/runtime-rpc-mobile-method-routing'
import '../unused-default-rpc-methods.test-fixture'
import { describe, expect, it, vi } from 'vitest'
import { getDefaultUIState } from '../../../../shared/constants'
import type { DartSavedView } from '../../../../shared/dart/dart-saved-views'
import type { PersistedUIState } from '../../../../shared/persisted-ui-state-types'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { CLIENT_UI_METHODS } from './client-ui'
import { RpcDispatcher } from '../dispatcher'

const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, input?: unknown) => unknown>()
}))
vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: vi.fn(), getAllWindows: vi.fn() },
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, input?: unknown) => unknown) =>
      handlers.set(channel, handler),
    on: vi.fn(),
    removeAllListeners: vi.fn()
  },
  webContents: { fromId: vi.fn(), getAllWebContents: vi.fn() }
}))

import { registerUIHandlers } from '../../../ipc/ui'

const view: DartSavedView = {
  id: 'mine',
  name: 'My work',
  filters: {
    mine: true,
    status: null,
    dartboard: null,
    search: '',
    tag: null,
    priority: null,
    onHold: false
  },
  layout: 'board',
  showEmptyColumns: true
}

function setup() {
  let ui: PersistedUIState = getDefaultUIState()
  const updateUIState = vi.fn((updates: Partial<PersistedUIState>) => {
    ui = { ...ui, ...updates }
    return ui
  })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: The dispatcher only invokes these three runtime methods in this test.
  const runtime = {
    getRuntimeId: () => 'host-a',
    getUIState: () => ui,
    updateUIState
  } as unknown as OrcaRuntimeService
  const dispatcher = new RpcDispatcher({ runtime, methods: CLIENT_UI_METHODS })
  const dispatch = (method: string, params?: unknown) =>
    dispatcher.dispatch({ id: 'request', method, params, authToken: 'token' })
  return { dispatch, updateUIState, read: () => ui }
}

describe('Dart saved-view runtime UI state', () => {
  it('stores views on the called host and applies mutations to current host state', async () => {
    const { dispatch } = setup()
    const second = { ...view, id: 'bugs', name: 'Bugs', layout: 'list' as const }
    expect(await dispatch('ui.getDartSavedViews')).toMatchObject({
      ok: true,
      result: { views: [], activeViewId: null }
    })
    await dispatch('ui.mutateDartSavedViews', { kind: 'save', view })
    await dispatch('ui.mutateDartSavedViews', { kind: 'save', view: second })
    await dispatch('ui.mutateDartSavedViews', { kind: 'select', id: 'bugs' })
    expect(await dispatch('ui.getDartSavedViews')).toMatchObject({
      ok: true,
      result: { views: [view, second], activeViewId: 'bugs' }
    })
  })

  it('keeps release B fields on a saved view', async () => {
    const { dispatch } = setup()
    const withB = {
      ...view,
      nestSubtasks: false,
      filters: { ...view.filters, blockedOnHold: true }
    }
    expect(await dispatch('ui.mutateDartSavedViews', { kind: 'save', view: withB })).toMatchObject({
      ok: true,
      result: { views: [withB] }
    })
  })

  it('saves a view without release B fields and leaves them absent', async () => {
    const { dispatch, read } = setup()
    expect(await dispatch('ui.mutateDartSavedViews', { kind: 'save', view })).toMatchObject({
      ok: true
    })
    expect(read().dartSavedViewState?.views).toEqual([view])
  })

  it('rejects oversized remote input without changing host UI state', async () => {
    const { dispatch, updateUIState } = setup()
    const tooLong = { ...view, filters: { ...view.filters, search: 'x'.repeat(501) } }
    expect(
      await dispatch('ui.mutateDartSavedViews', { kind: 'save', view: tooLong })
    ).toMatchObject({ ok: false, error: { code: 'invalid_argument' } })
    expect(updateUIState).not.toHaveBeenCalled()
  })

  it('gives IPC and RPC the same reply for the same host state', async () => {
    const { dispatch, read } = setup()
    const store = {
      onUIChanged: vi.fn(() => () => {}),
      getUI: vi.fn(() => read()),
      updateUI: vi.fn(),
      recordFeatureInteraction: vi.fn()
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: UI handler registration uses only the supplied store methods.
    registerUIHandlers(store as never)
    const rpcSave = await dispatch('ui.mutateDartSavedViews', { kind: 'save', view })
    const ipcGet = handlers.get('ui:getDartSavedViews')?.({})
    const rpcGet = await dispatch('ui.getDartSavedViews')
    expect(rpcSave).toMatchObject({ ok: true, result: ipcGet })
    expect(rpcGet).toMatchObject({ ok: true, result: ipcGet })
    const ipcSave = handlers.get('ui:mutateDartSavedViews')?.({}, { kind: 'save', view })
    expect(ipcSave).toEqual(ipcGet)
  })

  it('does not route saved views to paired phones', () => {
    expect(MOBILE_RPC_METHOD_ROUTES.has('ui.getDartSavedViews')).toBe(false)
    expect(MOBILE_RPC_METHOD_ROUTES.has('ui.mutateDartSavedViews')).toBe(false)
  })
})
