import { afterEach, describe, expect, it, vi } from 'vitest'
import { ListTasks } from '../../shared/rpc-contract/dart-params'
import {
  FIXTURE_TOKEN,
  installDartHost,
  jsonResponse,
  routeSignedIn,
  type DartHost
} from './dart-host.test-fixture'

vi.mock('../network/proxy-settings', () => ({
  ensureElectronProxyFromEnvironment: vi.fn().mockResolvedValue(undefined)
}))

const TASK_ID = 'abcDEF123456'
const CONFIG = {
  dartboards: ['General/Active', 'Eng/Backlog'],
  statuses: ['To-do', 'Doing', 'Done'],
  types: ['Task'],
  tags: ['bug', 'ui'],
  priorities: ['High', 'Low'],
  assignees: [{ name: 'Ada' }]
}
const RAW_TASK = {
  id: TASK_ID,
  htmlUrl: `https://app.dartai.com/t/${TASK_ID}-fix-it`,
  title: 'Fix it',
  parentId: null,
  dartboard: 'General/Active',
  type: 'Task',
  status: 'Doing',
  assignee: 'Ada',
  tags: ['bug'],
  priority: null,
  size: 3,
  createdBy: 'Ada',
  createdAt: '2026-10-01T00:00:00Z',
  customProperties: {}
}

let host: DartHost | null = null

async function connected() {
  vi.resetModules()
  host = await installDartHost()
  routeSignedIn(host, CONFIG)
  const client = await import('./client')
  await client.connect({ apiToken: FIXTURE_TOKEN })
  return { host, tasks: await import('./dart-tasks') }
}

function requestsTo(target: DartHost, path: string) {
  return target.fetch.mock.calls
    .map(([url, init]) => ({ url: new URL(url), init }))
    .filter(({ url }) => url.pathname.endsWith(path))
}

afterEach(() => {
  host?.restore()
  host = null
})

describe('dart error mapping', () => {
  const html404 = () => new Response('', { status: 404, headers: { 'content-type': 'text/html' } })
  it.each([
    ['401 JSON detail', () => jsonResponse(401, { detail: 'bad' }), 'dart.unauthorized'],
    ['404 JSON errors', () => jsonResponse(404, { errors: ['missing'] }), 'dart.taskNotFound'],
    ['404 empty HTML', html404, 'dart.taskNotFound'],
    ['429', () => jsonResponse(429, {}), 'dart.rateLimited'],
    ['500', () => jsonResponse(500, { detail: 'down' }), 'dart.loadFailed'],
    ['200 non-JSON', () => new Response('<html>', { status: 200 }), 'dart.loadFailed']
  ])('getTask maps %s to %s', async (_label, respond, errorCode) => {
    const { host, tasks } = await connected()
    host.route('GET', `/tasks/${TASK_ID}`, respond)

    await expect(tasks.getTask({ taskId: TASK_ID })).resolves.toMatchObject({
      ok: false,
      errorCode
    })
  })

  it.each([
    ['30', 'Retry after 30 seconds.'],
    ['2026-11-02T12:00:00Z', 'Retry after 2026-11-02T12:00:00.000Z.']
  ])('keeps a 429 Retry-After (%s) in the rate-limited failure', async (retryAfter, wait) => {
    const { host, tasks } = await connected()
    host.route(
      'GET',
      `/tasks/${TASK_ID}`,
      () => new Response(null, { status: 429, headers: { 'retry-after': retryAfter } })
    )

    await expect(tasks.getTask({ taskId: TASK_ID })).resolves.toEqual({
      ok: false,
      error: `Dart request failed (HTTP 429). ${wait}`,
      errorCode: 'dart.rateLimited'
    })
  })

  it('maps a network failure and a 400 field error on writes', async () => {
    const { host, tasks } = await connected()
    host.route('PUT', `/tasks/${TASK_ID}`, () => jsonResponse(400, { title: ['too long'] }))

    await expect(tasks.updateTask({ taskId: TASK_ID, updates: { title: 'x' } })).resolves.toEqual({
      ok: false,
      errorCode: 'dart.badRequest',
      error: 'Dart request failed (HTTP 400): title: too long'
    })
    // No POST /comments route: the fixture fetch rejects like a dropped connection.
    await expect(tasks.addComment({ taskId: TASK_ID, text: 'hi' })).resolves.toMatchObject({
      errorCode: 'dart.commentFailed'
    })
  })

  it('maps comments for an unknown task (400 bare array) to dart.taskNotFound', async () => {
    const { host, tasks } = await connected()
    host.route('GET', '/comments/list', () => jsonResponse(400, ['Unknown task']))

    await expect(tasks.listComments({ taskId: TASK_ID })).resolves.toMatchObject({
      errorCode: 'dart.taskNotFound'
    })
  })

  it('reports dart.notConnected without a request when no token is saved', async () => {
    vi.resetModules()
    host = await installDartHost()
    const tasks = await import('./dart-tasks')

    await expect(tasks.listTasks(undefined)).resolves.toMatchObject({
      errorCode: 'dart.notConnected'
    })
    expect(host.fetch).not.toHaveBeenCalled()
  })
})

describe('dart task reads', () => {
  it('sends only whitelisted filters, never no_defaults, and caps the page at 250', async () => {
    const { host, tasks } = await connected()
    host.route('GET', '/tasks/list', () => jsonResponse(200, { count: 0, results: [] }))
    const args = ListTasks.parse({
      dartboard: 'General/Active',
      isCompleted: false,
      title: 'fix',
      limit: 250
    })

    await tasks.listTasks(args)
    // A variable skips the excess-property check so the unknown `q` reaches the host.
    const withUnknownKey = { ...args, limit: 1000, offset: 500, q: 'ignored' }
    await tasks.listTasks(withUnknownKey)
    await tasks.listTasks(undefined)

    const [first, capped, defaults] = requestsTo(host, '/tasks/list').map(({ url }) =>
      Object.fromEntries(url.searchParams)
    )
    expect(first).toEqual({
      dartboard: 'General/Active',
      is_completed: 'false',
      title: 'fix',
      limit: '250',
      offset: '0'
    })
    expect(capped).toMatchObject({ limit: '250', offset: '500' })
    expect(capped).not.toHaveProperty('q')
    expect(defaults).toEqual({ limit: '100', offset: '0' })
  })

  it('keeps a task with an untrusted htmlUrl as an empty link and drops an unmappable one from the total', async () => {
    const { host, tasks } = await connected()
    host.route('GET', '/tasks/list', () =>
      jsonResponse(200, {
        count: 3,
        results: [
          RAW_TASK,
          { ...RAW_TASK, id: 'zzzzzzzzzzzz', htmlUrl: 'https://evil.example/t/zzzzzzzzzzzz' },
          { title: 'no id' }
        ]
      })
    )

    const result = await tasks.listTasks(undefined)

    expect(result).toMatchObject({ ok: true, totalCount: 2 })
    const listed = result.ok ? result.tasks : []
    expect(listed).toHaveLength(2)
    expect(listed[0]).toEqual({
      id: TASK_ID,
      title: 'Fix it',
      htmlUrl: RAW_TASK.htmlUrl,
      parentId: null,
      dartboard: 'General/Active',
      type: 'Task',
      status: 'Doing',
      assignee: 'Ada',
      tags: ['bug'],
      priority: null,
      size: 3,
      startAt: null,
      dueAt: null,
      createdBy: 'Ada',
      updatedBy: null,
      createdAt: '2026-10-01T00:00:00Z',
      completedAt: null
    })
    expect(listed[1]).toMatchObject({ id: 'zzzzzzzzzzzz', htmlUrl: '' })
  })

  it('unwraps {item} with its markdown description for getTask', async () => {
    const { host, tasks } = await connected()
    host.route('GET', `/tasks/${TASK_ID}`, () =>
      jsonResponse(200, { item: { ...RAW_TASK, description: '# Hi' } })
    )

    await expect(tasks.getTask({ taskId: TASK_ID })).resolves.toMatchObject({
      ok: true,
      task: { id: TASK_ID, description: '# Hi' }
    })
  })
})

describe('dart task writes', () => {
  it('creates with canonical config names and the {item} body', async () => {
    const { host, tasks } = await connected()
    host.route('POST', '/tasks', () => jsonResponse(200, { item: RAW_TASK }))

    const result = await tasks.createTask({
      title: 'Fix it',
      dartboard: 'general/active',
      status: 'doing',
      tags: ['BUG'],
      assignee: 'ada@example.com'
    })

    expect(result).toMatchObject({ ok: true, task: { id: TASK_ID } })
    expect(host.lastBody()).toEqual({
      item: {
        title: 'Fix it',
        dartboard: 'General/Active',
        status: 'Doing',
        tags: ['bug'],
        assignee: 'ada@example.com'
      }
    })
  })

  it('rejects an unknown tag after re-reading /config and sends no write', async () => {
    const { host, tasks } = await connected()
    host.route('POST', '/tasks', () => jsonResponse(200, { item: RAW_TASK }))

    await expect(tasks.createTask({ title: 'x', tags: ['brand-new'] })).resolves.toEqual({
      ok: false,
      errorCode: 'dart.badRequest',
      error: 'Unknown Dart tags: brand-new'
    })
    expect(requestsTo(host, '/tasks')).toHaveLength(0)
    expect(requestsTo(host, '/config')).toHaveLength(2)
  })

  it('updates with PUT {item: {id, ...}} and passes null to clear', async () => {
    const { host, tasks } = await connected()
    host.route('PUT', `/tasks/${TASK_ID}`, () => jsonResponse(200, { item: RAW_TASK }))

    await tasks.updateTask({ taskId: TASK_ID, updates: { assignee: null, priority: 'high' } })

    expect(host.lastBody()).toEqual({ item: { id: TASK_ID, assignee: null, priority: 'High' } })
  })

  it('adds a comment with POST /comments {item}', async () => {
    const { host, tasks } = await connected()
    host.route('POST', '/comments', () =>
      jsonResponse(200, {
        item: {
          id: 'cmt000000001',
          taskId: TASK_ID,
          htmlUrl: 'https://app.dartai.com/c/cmt000000001',
          author: 'Ada',
          text: 'hi'
        }
      })
    )

    await expect(tasks.addComment({ taskId: TASK_ID, text: 'hi' })).resolves.toMatchObject({
      ok: true,
      comment: { id: 'cmt000000001', author: 'Ada', text: 'hi' }
    })
    expect(host.lastBody()).toEqual({ item: { taskId: TASK_ID, text: 'hi' } })
  })
})
