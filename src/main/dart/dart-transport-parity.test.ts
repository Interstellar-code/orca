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
import { DART_TITLE_MAX_LENGTH } from '../../shared/dart/dart-text-limits'

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
    dartDisconnect: () => dart.dartDisconnect(),
    dartListTasks: (args: Parameters<typeof dart.dartListTasks>[0]) => dart.dartListTasks(args),
    dartCreateTask: (args: Parameters<typeof dart.dartCreateTask>[0]) => dart.dartCreateTask(args),
    dartUpdateTask: (args: Parameters<typeof dart.dartUpdateTask>[0]) => dart.dartUpdateTask(args),
    dartUpdateTaskDescription: (args: Parameters<typeof dart.dartUpdateTaskDescription>[0]) =>
      dart.dartUpdateTaskDescription(args),
    dartAddComment: (args: Parameters<typeof dart.dartAddComment>[0]) => dart.dartAddComment(args)
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

const TASK_ID = 'abcDEF123456'
const WRITES = [
  {
    name: 'create',
    channel: 'dart:createTask',
    method: 'dart.createTask',
    http: ['POST', '/tasks'],
    params: { title: 'x', status: 'Doing' }
  },
  {
    name: 'update',
    channel: 'dart:updateTask',
    method: 'dart.updateTask',
    http: ['PUT', `/tasks/${TASK_ID}`],
    params: { taskId: TASK_ID, updates: { status: 'Doing' } }
  },
  {
    name: 'comment',
    channel: 'dart:addComment',
    method: 'dart.addComment',
    http: ['POST', '/comments'],
    params: { taskId: TASK_ID, text: 'hi' }
  },
  {
    name: 'description patch',
    channel: 'dart:updateTaskDescription',
    method: 'dart.updateTaskDescription',
    http: ['POST', `/tasks/${TASK_ID}/update-description`],
    params: { taskId: TASK_ID, updates: [{ type: 'delete', oldText: 'a' }] }
  }
] as const

const CONFIG = { statuses: ['Doing'], dartboards: ['General/Active'] }

describe('dart write outcome over both transports', () => {
  const lostResponses: [string, () => Response | Promise<Response>, 'unknown' | 'notApplied'][] = [
    ['an unreadable 200 body', () => new Response('<html>', { status: 200 }), 'unknown'],
    [
      'a dropped connection',
      () => {
        throw new TypeError('socket hang up')
      },
      'unknown'
    ],
    ['a 503', () => jsonResponse(503, {}), 'unknown'],
    ['an HTTP 408', () => jsonResponse(408, {}), 'unknown'],
    ['a 400', () => jsonResponse(400, { title: ['bad'] }), 'notApplied']
  ]

  for (const write of WRITES) {
    it.each(lostResponses)(
      `${write.name}: %s gives the same reply on IPC and RPC`,
      async (_label, respond, outcome) => {
        const { host, ipc, rpc } = await transports()
        routeSignedIn(host, CONFIG)
        await ipc('dart:connect', { apiToken: FIXTURE_TOKEN })
        host.route(write.http[0], write.http[1], respond)

        const overIpc = await ipc(write.channel, write.params)
        const overRpc = await rpc(write.method, write.params)

        expect(overIpc).toMatchObject({ ok: false, outcome })
        expect(overRpc).toEqual(overIpc)
      }
    )
  }

  it.each(WRITES.filter((write) => write.name === 'create' || write.name === 'update'))(
    '$name: an unknown dartboard name is notApplied and sends no write',
    async (write) => {
      const { host, ipc, rpc } = await transports()
      routeSignedIn(host, CONFIG)
      await ipc('dart:connect', { apiToken: FIXTURE_TOKEN })
      host.route(write.http[0], write.http[1], () => jsonResponse(200, {}))
      const params =
        write.name === 'create'
          ? { title: 'x', dartboard: 'Nope/Board' }
          : { taskId: TASK_ID, updates: { dartboard: 'Nope/Board' } }

      const overIpc = await ipc(write.channel, params)
      const overRpc = await rpc(write.method, params)

      expect(overIpc).toMatchObject({
        ok: false,
        errorCode: 'dart.badRequest',
        outcome: 'notApplied'
      })
      expect(overRpc).toEqual(overIpc)
      expect(
        host.fetch.mock.calls.some(
          ([url, init]) =>
            init?.method === write.http[0] && new URL(url).pathname.endsWith(write.http[1])
        )
      ).toBe(false)
    }
  )

  it.each(WRITES.filter((write) => write.name === 'create' || write.name === 'update'))(
    '$name: a /config network failure before the write is notApplied',
    async (write) => {
      const { host, ipc, rpc } = await transports()
      routeSignedIn(host, CONFIG)
      await ipc('dart:connect', { apiToken: FIXTURE_TOKEN })
      host.route('GET', '/config', () => {
        throw new TypeError('offline')
      })
      host.route(write.http[0], write.http[1], () => jsonResponse(200, {}))
      const params =
        write.name === 'create'
          ? { title: 'x', dartboard: 'Other/Board' }
          : { taskId: TASK_ID, updates: { dartboard: 'Other/Board' } }

      const overIpc = await ipc(write.channel, params)
      const overRpc = await rpc(write.method, params)

      expect(overIpc).toMatchObject({ ok: false, outcome: 'notApplied' })
      expect(overRpc).toEqual(overIpc)
    }
  )

  it('reports notApplied when no token is saved', async () => {
    const { ipc, rpc } = await transports()
    const params = { taskId: TASK_ID, text: 'hi' }
    const overIpc = await ipc('dart:addComment', params)
    expect(overIpc).toMatchObject({
      ok: false,
      errorCode: 'dart.notConnected',
      outcome: 'notApplied'
    })
    expect(await rpc('dart.addComment', params)).toEqual(overIpc)
  })

  it('returns a successful write without an outcome', async () => {
    const { host, ipc } = await transports()
    routeSignedIn(host, CONFIG)
    await ipc('dart:connect', { apiToken: FIXTURE_TOKEN })
    host.route('POST', '/comments', () =>
      jsonResponse(200, {
        item: { id: 'cmt000000001', taskId: TASK_ID, text: 'hi', author: 'Ada' }
      })
    )
    expect(await ipc('dart:addComment', { taskId: TASK_ID, text: 'hi' })).not.toHaveProperty(
      'outcome'
    )
  })
})

describe('dart write params refused at the transport', () => {
  const invalid = [
    {
      name: 'a patch update carrying occurrence',
      write: WRITES[3],
      params: {
        taskId: TASK_ID,
        updates: [{ type: 'replace', oldText: 'a', newText: 'b', occurrence: 2 }]
      }
    },
    {
      name: 'a title over the limit',
      write: WRITES[0],
      params: { title: 'x'.repeat(DART_TITLE_MAX_LENGTH + 1) }
    }
  ]

  it.each(invalid)(
    'refuses $name as notApplied over IPC and invalid_argument over RPC',
    async (c) => {
      const { host, ipc, rpc } = await transports()
      routeSignedIn(host, CONFIG)
      await ipc('dart:connect', { apiToken: FIXTURE_TOKEN })
      host.route(c.write.http[0], c.write.http[1], () => jsonResponse(200, {}))
      const writesBefore = host.fetch.mock.calls.length

      await expect(ipc(c.write.channel, c.params)).resolves.toMatchObject({
        ok: false,
        errorCode: 'dart.badRequest',
        outcome: 'notApplied'
      })
      await expect(rpc(c.write.method, c.params)).resolves.toMatchObject({
        ok: false,
        error: { code: 'invalid_argument' }
      })
      expect(host.fetch.mock.calls).toHaveLength(writesBefore)
    }
  )

  it.each([
    ['size 3', { size: 3 }],
    ['size "M"', { size: 'M' }],
    ['size null', { size: null }],
    ['a date-only dueAt', { dueAt: '2026-11-30' }]
  ])(
    'sends %s from a parsed update to the Dart request body on both transports',
    async (_n, updates) => {
      const { host, ipc, rpc } = await transports()
      routeSignedIn(host, CONFIG)
      await ipc('dart:connect', { apiToken: FIXTURE_TOKEN })
      host.route('PUT', `/tasks/${TASK_ID}`, () => jsonResponse(200, {}))
      const params = { taskId: TASK_ID, updates }

      await ipc('dart:updateTask', params)
      expect(host.lastBody()).toEqual({ item: { id: TASK_ID, ...updates } })
      await rpc('dart.updateTask', params)
      expect(host.lastBody()).toEqual({ item: { id: TASK_ID, ...updates } })
    }
  )
})

describe('dart description patch replies over both transports', () => {
  const patch = WRITES[3]
  const RAW_TASK = {
    id: TASK_ID,
    htmlUrl: `https://app.dartai.com/t/${TASK_ID}-fix-it`,
    title: 'Fix it',
    status: 'Doing',
    description: 'patched'
  }

  async function connectedPair() {
    const pair = await transports()
    routeSignedIn(pair.host, CONFIG)
    await pair.ipc('dart:connect', { apiToken: FIXTURE_TOKEN })
    return pair
  }

  it('sends the same bare {updates} body and returns the same task', async () => {
    const { host, ipc, rpc } = await connectedPair()
    host.route('POST', patch.http[1], () => jsonResponse(200, { item: RAW_TASK }))

    const overIpc = await ipc(patch.channel, patch.params)
    expect(host.lastBody()).toEqual({ updates: patch.params.updates })
    const overRpc = await rpc(patch.method, patch.params)
    expect(host.lastBody()).toEqual({ updates: patch.params.updates })

    expect(overIpc).toMatchObject({ ok: true, task: { id: TASK_ID, description: 'patched' } })
    expect(overRpc).toEqual(overIpc)
  })

  it('keeps task text Dart echoes in a 400 out of both replies', async () => {
    const { host, ipc, rpc } = await connectedPair()
    host.route('POST', patch.http[1], () =>
      jsonResponse(400, { errors: ['oldText "SECRET PARAGRAPH" was not found'] })
    )

    const overIpc = await ipc(patch.channel, patch.params)
    const overRpc = await rpc(patch.method, patch.params)

    expect(overIpc).toMatchObject({
      errorCode: 'dart.descriptionPatchRefused',
      outcome: 'notApplied'
    })
    expect(overRpc).toEqual(overIpc)
    expect(JSON.stringify([overIpc, overRpc])).not.toContain('SECRET PARAGRAPH')
  })

  it('gives the same rate-limit reply and never retries the write', async () => {
    const { host, ipc, rpc } = await connectedPair()
    host.route(
      'POST',
      patch.http[1],
      () =>
        new Response('{}', {
          status: 429,
          headers: { 'content-type': 'application/json', 'retry-after': '30' }
        })
    )
    const callsBefore = host.fetch.mock.calls.length

    const overIpc = await ipc(patch.channel, patch.params)
    const overRpc = await rpc(patch.method, patch.params)

    expect(overIpc).toMatchObject({ errorCode: 'dart.rateLimited', outcome: 'notApplied' })
    expect(overRpc).toEqual(overIpc)
    expect(host.fetch.mock.calls.length - callsBefore).toBe(2)
  })
})

describe('dart comment replies over both transports', () => {
  const comment = WRITES[2]
  const RAW_COMMENT = { id: 'cmt000000001', taskId: TASK_ID, text: 'hi', author: 'Ada' }

  async function connectedPair() {
    const pair = await transports()
    routeSignedIn(pair.host, CONFIG)
    await pair.ipc('dart:connect', { apiToken: FIXTURE_TOKEN })
    return pair
  }

  it('sends the same body, with parentId only on a reply, and returns the same comment', async () => {
    const { host, ipc, rpc } = await connectedPair()
    host.route('POST', comment.http[1], () => jsonResponse(200, { item: RAW_COMMENT }))
    const reply = { taskId: TASK_ID, text: 'hi', parentId: 'parent000001' }

    const root = await ipc(comment.channel, comment.params)
    expect(host.lastBody()).toEqual({ item: { taskId: TASK_ID, text: 'hi' } })
    expect(await rpc(comment.method, comment.params)).toEqual(root)
    expect(host.lastBody()).toEqual({ item: { taskId: TASK_ID, text: 'hi' } })

    const overIpc = await ipc(comment.channel, reply)
    expect(host.lastBody()).toEqual({ item: reply })
    expect(await rpc(comment.method, reply)).toEqual(overIpc)
    expect(host.lastBody()).toEqual({ item: reply })
    expect(overIpc).toMatchObject({ ok: true, comment: { id: RAW_COMMENT.id, author: 'Ada' } })
  })

  it('gives the same rate-limit reply and never retries the comment', async () => {
    const { host, ipc, rpc } = await connectedPair()
    host.route(
      'POST',
      comment.http[1],
      () =>
        new Response('{}', {
          status: 429,
          headers: { 'content-type': 'application/json', 'retry-after': '30' }
        })
    )
    const callsBefore = host.fetch.mock.calls.length

    const overIpc = await ipc(comment.channel, comment.params)
    const overRpc = await rpc(comment.method, comment.params)

    expect(overIpc).toMatchObject({ errorCode: 'dart.rateLimited', outcome: 'notApplied' })
    expect(overRpc).toEqual(overIpc)
    expect(host.fetch.mock.calls.length - callsBefore).toBe(2)
  })
})

describe('dart list replies over both transports', () => {
  it('carries the same raw counts and order key, with one unmappable row dropped', async () => {
    const { host, ipc, rpc } = await transports()
    routeSignedIn(host, CONFIG)
    await ipc('dart:connect', { apiToken: FIXTURE_TOKEN })
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: `abcDEF12345${i}`,
      htmlUrl: `https://app.dartai.com/t/abcDEF12345${i}-t`,
      title: `Task ${i}`,
      status: 'Doing'
    }))
    host.route('GET', '/tasks/list', () =>
      jsonResponse(200, { count: 40, results: [...rows, { title: 'no id' }] })
    )
    const params = { order: 'order', offset: 20 } as const

    const overIpc = await ipc('dart:listTasks', params)
    const overRpc = await rpc('dart.listTasks', params)

    expect(overIpc).toMatchObject({ ok: true, raw: { rowCount: 4, totalCount: 40 } })
    expect(overRpc).toEqual(overIpc)
    const last = host.fetch.mock.calls.at(-1)?.[0]
    expect(String(last)).toContain('o=order')
  })
})

describe('dart board page over both transports', () => {
  it.each([
    ['order', 500],
    ['-completed_at', 500]
  ] as const)(
    'sends o=%s offset=%i identically and returns the same 249 tasks with raw counts',
    async (order, offset) => {
      const { host, ipc, rpc } = await transports()
      routeSignedIn(host, CONFIG)
      await ipc('dart:connect', { apiToken: FIXTURE_TOKEN })
      const rows = Array.from({ length: 249 }, (_, i) => ({
        id: `id${String(i).padStart(10, '0')}`,
        htmlUrl: `https://app.dartai.com/t/id${String(i).padStart(10, '0')}-t`,
        title: `Task ${i}`,
        status: 'Doing'
      }))
      host.route('GET', '/tasks/list', () =>
        jsonResponse(200, { count: 900, results: [...rows, { title: 'no id' }] })
      )
      const params = { order, offset }
      const listUrls = () =>
        host.fetch.mock.calls
          .map(([url]) => new URL(url))
          .filter((url) => url.pathname.endsWith('/tasks/list'))

      const overIpc = await ipc('dart:listTasks', params)
      const overRpc = await rpc('dart.listTasks', params)

      const [ipcQuery, rpcQuery] = listUrls().map((url) => Object.fromEntries(url.searchParams))
      expect(ipcQuery).toMatchObject({ o: order, offset: String(offset) })
      expect(rpcQuery).toEqual(ipcQuery)
      expect(overIpc).toMatchObject({ ok: true, raw: { rowCount: 250, totalCount: 900 } })
      expect(overIpc).toHaveProperty('tasks.length', 249)
      expect(overRpc).toEqual(overIpc)
    }
  )

  it('refuses an unknown order the same way on both transports, with no Dart request', async () => {
    const { host, ipc, rpc } = await transports()
    routeSignedIn(host, CONFIG)
    await ipc('dart:connect', { apiToken: FIXTURE_TOKEN })
    host.route('GET', '/tasks/list', () => jsonResponse(200, { count: 0, results: [] }))
    const before = host.fetch.mock.calls.length

    await expect(ipc('dart:listTasks', { order: 'priority' })).resolves.toMatchObject({
      ok: false,
      errorCode: 'dart.badRequest'
    })
    await expect(rpc('dart.listTasks', { order: 'priority' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_argument' }
    })
    expect(host.fetch.mock.calls).toHaveLength(before)
  })

  it('advertises the board and saved-view capabilities the host now serves', async () => {
    await transports()
    const { RUNTIME_CAPABILITIES } = await import('../../shared/protocol-version')
    const { DART_METHODS } = await import('../runtime/rpc/methods/dart')

    expect(RUNTIME_CAPABILITIES).toEqual(
      expect.arrayContaining(['dart.board.v1', 'dart.savedViews.v1'])
    )
    // dart.board.v1 stands for the `order` list key, so the served method must accept it.
    const listTasks = DART_METHODS.find((method) => method.name === 'dart.listTasks')
    expect(listTasks?.params?.safeParse({ order: 'order', offset: 500 }).success).toBe(true)
  })
})
