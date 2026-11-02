import '../runtime/rpc/unused-default-rpc-methods.test-fixture'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FIXTURE_TOKEN,
  FIXTURE_USER,
  installDartHost,
  jsonResponse,
  routeSignedIn,
  type DartHost
} from './dart-host.test-fixture'

const ipcHandlers = vi.hoisted(() => new Map<string, (event: unknown, args?: unknown) => unknown>())
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, args?: unknown) => unknown) =>
      ipcHandlers.set(channel, handler)
  }
}))
vi.mock('../preflight/agent-detection', () => ({ _resetPreflightCache: vi.fn() }))
vi.mock('../network/proxy-settings', () => ({
  ensureElectronProxyFromEnvironment: vi.fn().mockResolvedValue(undefined)
}))

let host: DartHost | null = null

/** IPC handlers and the RPC dispatcher over the same freshly loaded `src/main/dart` module state. */
async function transports() {
  vi.resetModules()
  ipcHandlers.clear()
  host = await installDartHost()
  const { registerDartHandlers } = await import('../ipc/dart/register-handlers')
  const { RpcDispatcher } = await import('../runtime/rpc/dispatcher')
  const { DART_METHODS } = await import('../runtime/rpc/methods/dart')
  const { RuntimeDartCommands } = await import('../runtime/runtime-dart-commands')
  registerDartHandlers()
  const dart = new RuntimeDartCommands()
  const runtime = {
    getRuntimeId: () => 'test-runtime',
    dartStatus: () => dart.dartStatus(),
    dartConnect: (args: { apiToken: string }) => dart.dartConnect(args),
    dartDisconnect: () => dart.dartDisconnect()
  }
  const dispatcher = new RpcDispatcher({
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the dispatcher reaches only getRuntimeId and the dart* methods stubbed above.
    runtime: runtime as unknown as ConstructorParameters<typeof RpcDispatcher>[0]['runtime'],
    methods: DART_METHODS
  })
  return {
    host,
    ipc: (channel: string, args?: unknown) => ipcHandlers.get(channel)?.({}, args),
    rpc: async (method: string, params?: unknown) => {
      const response = await dispatcher.dispatch({ id: 'req', authToken: 'tok', method, params })
      return response.ok ? response.result : response
    }
  }
}

afterEach(() => {
  host?.restore()
  host = null
  vi.restoreAllMocks()
})

describe('dart IPC and RPC parity', () => {
  it('returns the same dart.* failure over both transports', async () => {
    const { host, ipc, rpc } = await transports()
    host.route('GET', '/me', () => jsonResponse(401, { detail: 'Invalid token.' }))

    const overIpc = await ipc('dart:connect', { apiToken: FIXTURE_TOKEN })
    const overRpc = await rpc('dart.connect', { apiToken: FIXTURE_TOKEN })

    expect(overIpc).toMatchObject({ ok: false, errorCode: 'dart.unauthorized' })
    expect(overRpc).toEqual(overIpc)
  })

  it('shows an IPC connect and disconnect in RPC dart.status', async () => {
    const { host, ipc, rpc } = await transports()
    routeSignedIn(host)

    await expect(ipc('dart:connect', { apiToken: FIXTURE_TOKEN })).resolves.toMatchObject({
      ok: true
    })
    await expect(rpc('dart.status')).resolves.toMatchObject({
      ok: true,
      connected: true,
      viewer: { id: FIXTURE_USER.id }
    })

    await ipc('dart:disconnect')
    await expect(rpc('dart.status')).resolves.toMatchObject({ connected: false, viewer: null })
  })

  it('resets the preflight cache on an RPC connect and disconnect, like IPC', async () => {
    const { host, rpc } = await transports()
    routeSignedIn(host)
    const { _resetPreflightCache } = await import('../preflight/agent-detection')
    vi.mocked(_resetPreflightCache).mockClear()

    await expect(rpc('dart.connect', { apiToken: FIXTURE_TOKEN })).resolves.toMatchObject({
      ok: true
    })
    expect(_resetPreflightCache).toHaveBeenCalledTimes(1)
    await rpc('dart.disconnect')
    expect(_resetPreflightCache).toHaveBeenCalledTimes(2)
  })

  it('keeps the token out of logs and serialized connect errors on both transports', async () => {
    const logged: unknown[] = []
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, level).mockImplementation((...args) => void logged.push(...args))
    }
    const { host, ipc, rpc } = await transports()
    host.route('GET', '/me', () => new Response('<html>', { status: 502 }))

    const replies = [
      await ipc('dart:connect', { apiToken: FIXTURE_TOKEN }),
      await ipc('dart:connect', { apiToken: 42, extra: FIXTURE_TOKEN }),
      await rpc('dart.connect', { apiToken: FIXTURE_TOKEN }),
      await rpc('dart.connect', { apiToken: [FIXTURE_TOKEN] })
    ]

    expect(replies.map((reply) => (reply && typeof reply === 'object' ? reply : {}))).toEqual([
      expect.objectContaining({ ok: false, errorCode: 'dart.connectFailed' }),
      expect.objectContaining({ ok: false, errorCode: 'dart.badRequest' }),
      expect.objectContaining({ ok: false, errorCode: 'dart.connectFailed' }),
      expect.objectContaining({ ok: false })
    ])
    expect(JSON.stringify(replies)).not.toContain(FIXTURE_TOKEN)
    expect(logged.map((entry) => JSON.stringify(entry) ?? String(entry)).join('\n')).not.toContain(
      FIXTURE_TOKEN
    )
  })
})
