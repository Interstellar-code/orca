import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DartTask } from '../../shared/dart/dart-types'
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
      error: 'Dart request failed (HTTP 400): title: too long',
      outcome: 'notApplied'
    })
    // No POST /comments route: the fixture fetch rejects like a dropped connection.
    await expect(tasks.addComment({ taskId: TASK_ID, text: 'hi' })).resolves.toMatchObject({
      errorCode: 'dart.commentFailed'
    })
  })

  it('returns an empty list for comments of an unknown task, as real Dart does (200)', async () => {
    const { host, tasks } = await connected()
    host.route('GET', '/comments/list', () => jsonResponse(200, { count: 0, results: [] }))

    await expect(tasks.listComments({ taskId: TASK_ID })).resolves.toEqual({
      ok: true,
      comments: [],
      totalCount: 0,
      rawCount: 0
    })
  })

  it('maps addComment on an unknown task (400 taskId error) to dart.taskNotFound, notApplied', async () => {
    const { host, tasks } = await connected()
    host.route('POST', '/comments', () =>
      jsonResponse(400, { errors: [`taskId: No Task found with ID: ${TASK_ID}`] })
    )

    await expect(tasks.addComment({ taskId: TASK_ID, text: 'hi' })).resolves.toMatchObject({
      errorCode: 'dart.taskNotFound',
      outcome: 'notApplied'
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

  it.each([
    ['order', 'order'],
    ['-completed_at', '-completed_at']
  ] as const)('sends order %s as o', async (order, expected) => {
    const { host, tasks } = await connected()
    host.route('GET', '/tasks/list', () => jsonResponse(200, { count: 0, results: [] }))

    await tasks.listTasks({ order, offset: 500 })
    await tasks.listTasks({})

    const [ordered, unordered] = requestsTo(host, '/tasks/list').map(({ url }) => url.searchParams)
    expect(ordered.getAll('o')).toEqual([expected])
    expect(ordered.get('offset')).toBe('500')
    expect(unordered.has('o')).toBe(false)
  })

  it('refuses an unknown order value', () => {
    expect(ListTasks.safeParse({ order: 'priority' }).success).toBe(false)
    expect(ListTasks.safeParse({ order: '-title' }).success).toBe(true)
  })

  it('reports Dart raw row and total counts apart from the adjusted total', async () => {
    const { host, tasks } = await connected()
    const results = Array.from({ length: 249 }, (_, i) => ({
      ...RAW_TASK,
      id: `id${String(i).padStart(10, '0')}`
    }))
    host.route('GET', '/tasks/list', () =>
      jsonResponse(200, { count: 600, results: [...results, { title: 'no id' }] })
    )

    const result = await tasks.listTasks(undefined)

    expect(result).toMatchObject({
      ok: true,
      totalCount: 599,
      raw: { rowCount: 250, totalCount: 600 }
    })
    expect(result.ok ? result.tasks : []).toHaveLength(249)
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
      error: 'Unknown Dart tags: brand-new',
      outcome: 'notApplied'
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

  it('sends a date-only date and a size of 3, "M" and null in the update body', async () => {
    const { host, tasks } = await connected()
    host.route('PUT', `/tasks/${TASK_ID}`, () => jsonResponse(200, { item: RAW_TASK }))

    for (const size of [3, 'M', null]) {
      await tasks.updateTask({ taskId: TASK_ID, updates: { size, dueAt: '2026-11-30' } })
      expect(host.lastBody()).toEqual({ item: { id: TASK_ID, size, dueAt: '2026-11-30' } })
    }
  })

  it('sends size and a date-only start in the create body', async () => {
    const { host, tasks } = await connected()
    host.route('POST', '/tasks', () => jsonResponse(200, { item: RAW_TASK }))

    await tasks.createTask({ title: 'x', size: 'L', startAt: '2026-11-01' })

    expect(host.lastBody()).toEqual({ item: { title: 'x', size: 'L', startAt: '2026-11-01' } })
  })

  it('patches the description with POST update-description and a bare {updates} body', async () => {
    const { host, tasks } = await connected()
    host.route('POST', `/tasks/${TASK_ID}/update-description`, () =>
      jsonResponse(200, { item: RAW_TASK })
    )
    const updates = [
      { type: 'replace' as const, oldText: 'a', newText: 'b' },
      { type: 'insert_after' as const, anchorText: 'b', newText: 'c' }
    ]

    await expect(tasks.updateTaskDescription({ taskId: TASK_ID, updates })).resolves.toMatchObject({
      ok: true,
      task: { id: TASK_ID }
    })
    expect(host.lastBody()).toEqual({ updates })
  })

  it('keeps task text Dart echoes in a patch 400 out of the reply', async () => {
    const { host, tasks } = await connected()
    host.route('POST', `/tasks/${TASK_ID}/update-description`, () =>
      jsonResponse(400, { errors: ['oldText "SECRET PARAGRAPH" was not found'] })
    )

    const result = await tasks.updateTaskDescription({
      taskId: TASK_ID,
      updates: [{ type: 'delete', oldText: 'SECRET PARAGRAPH' }]
    })

    expect(result).toEqual({
      ok: false,
      errorCode: 'dart.descriptionPatchRefused',
      error: 'Dart did not accept this change.',
      outcome: 'notApplied'
    })
  })

  it.each([
    [400, 'dart.descriptionPatchRefused'],
    [404, 'dart.taskNotFound'],
    [429, 'dart.rateLimited']
  ])('maps a %s description patch to %s', async (status, errorCode) => {
    const { host, tasks } = await connected()
    host.route(
      'POST',
      `/tasks/${TASK_ID}/update-description`,
      () =>
        new Response(JSON.stringify({ errors: ['x'] }), {
          status,
          headers: { 'content-type': 'application/json', 'retry-after': '30' }
        })
    )

    const result = await tasks.updateTaskDescription({
      taskId: TASK_ID,
      updates: [{ type: 'delete', oldText: 'a' }]
    })

    expect(result).toMatchObject({ ok: false, errorCode, outcome: 'notApplied' })
    if (status === 429 && !result.ok) {
      expect(result.error).toContain('Retry after 30 seconds.')
    }
  })
})

const BLOCKER_A = 'aaaaaaaaaaaa'
const BLOCKER_B = 'bbbbbbbbbbbb'
const PATH = `/tasks/${TASK_ID}`

describe('dart relationships', () => {
  it('sends parent_id and comma-joined ids', async () => {
    const { host, tasks } = await connected()
    host.route('GET', '/tasks/list', () => jsonResponse(200, { count: 0, results: [] }))

    await tasks.listTasks({ parentId: TASK_ID, ids: [BLOCKER_A, BLOCKER_B] })

    const query = requestsTo(host, '/tasks/list')[0].url.searchParams
    expect(query.get('parent_id')).toBe(TASK_ID)
    expect(query.get('ids')).toBe(`${BLOCKER_A},${BLOCKER_B}`)
  })

  it('maps taskRelationships when present, drops bad ids, and gives empty lists for null', async () => {
    const { host, tasks } = await connected()
    const responses = [
      { taskRelationships: { blockerIds: [BLOCKER_A, 'bad', 7], subtaskIds: [BLOCKER_B] } },
      { taskRelationships: null },
      { taskRelationships: { blockingIds: null } },
      {}
    ]
    host.route('GET', PATH, () =>
      jsonResponse(200, { item: { ...RAW_TASK, ...responses.shift() } })
    )

    const results: (DartTask | null)[] = []
    for (let i = 0; i < 4; i++) {
      const result = await tasks.getTask({ taskId: TASK_ID })
      results.push(result.ok ? result.task : null)
    }

    const empty = {
      subtaskIds: [],
      blockerIds: [],
      blockingIds: [],
      duplicateIds: [],
      relatedIds: []
    }
    expect(results[0]?.relationships).toEqual({
      ...empty,
      blockerIds: [BLOCKER_A],
      subtaskIds: [BLOCKER_B]
    })
    expect(results[1]?.relationships).toEqual(empty)
    expect(results[2]?.relationships).toEqual(empty)
    expect(results[3]).not.toHaveProperty('relationships')
  })

  it('maps taskRelationships on list items: present, null, and absent', async () => {
    const { host, tasks } = await connected()
    const results = [
      { id: 'cccccccccccc', taskRelationships: { blockerIds: [BLOCKER_A, 'bad'] } },
      { id: 'dddddddddddd', taskRelationships: null },
      { id: 'eeeeeeeeeeee' }
    ].map((patch) => ({ ...RAW_TASK, ...patch }))
    host.route('GET', '/tasks/list', () => jsonResponse(200, { count: 3, results }))

    const reply = await tasks.listTasks(undefined)

    if (!reply.ok) {
      throw new Error('listTasks failed')
    }
    const empty = {
      subtaskIds: [],
      blockerIds: [],
      blockingIds: [],
      duplicateIds: [],
      relatedIds: []
    }
    expect(reply.tasks[0].relationships).toEqual({ ...empty, blockerIds: [BLOCKER_A] })
    expect(reply.tasks[1].relationships).toEqual(empty)
    expect(reply.tasks[2]).not.toHaveProperty('relationships')
  })

  describe('updateTaskBlockers', () => {
    const args = { taskId: TASK_ID, blockerIds: [BLOCKER_A] }

    async function withRead(taskRelationships?: unknown) {
      const ctx = await connected()
      const item = taskRelationships === undefined ? RAW_TASK : { ...RAW_TASK, taskRelationships }
      ctx.host.route('GET', PATH, () => jsonResponse(200, { item }))
      ctx.host.route('PUT', PATH, () => jsonResponse(200, { item: RAW_TASK }))
      return ctx
    }

    it('resends the other lists exactly as read, keeps omitted lists omitted', async () => {
      const { host, tasks } = await withRead({
        blockerIds: [BLOCKER_B],
        subtaskIds: ['not-an-id', BLOCKER_B],
        relatedIds: [],
        blockingIds: null,
        duplicateIds: ['bad-dup', BLOCKER_A]
      })

      await expect(tasks.updateTaskBlockers(args)).resolves.toMatchObject({ ok: true })

      expect(host.lastBody()).toEqual({
        item: {
          id: TASK_ID,
          taskRelationships: {
            blockerIds: [BLOCKER_A],
            subtaskIds: ['not-an-id', BLOCKER_B],
            relatedIds: [],
            blockingIds: null,
            duplicateIds: ['bad-dup', BLOCKER_A]
          }
        }
      })
    })

    it('sends only blockerIds when taskRelationships is null', async () => {
      const { host, tasks } = await withRead(null)

      await tasks.updateTaskBlockers(args)

      expect(host.lastBody()).toEqual({
        item: { id: TASK_ID, taskRelationships: { blockerIds: [BLOCKER_A] } }
      })
    })

    it.each([
      ['missing', undefined],
      ['a string', 'x'],
      ['an array', []]
    ])('sends no write when taskRelationships is %s', async (_label, value) => {
      const { host, tasks } = await withRead(value)

      await expect(tasks.updateTaskBlockers(args)).resolves.toEqual({
        ok: false,
        errorCode: 'dart.updateFailed',
        error: "Dart did not return this task's links",
        outcome: 'notApplied'
      })
      expect(requestsTo(host, PATH).map(({ init }) => init?.method ?? 'GET')).toEqual(['GET'])
    })

    it('sends no write when the pre-read fails', async () => {
      const { host, tasks } = await connected()
      host.route('GET', PATH, () => jsonResponse(500, { detail: 'down' }))

      await expect(tasks.updateTaskBlockers(args)).resolves.toMatchObject({
        ok: false,
        outcome: 'notApplied'
      })
      expect(requestsTo(host, PATH)).toHaveLength(1)
    })

    it('reports a dropped connection after the write as unknown', async () => {
      const { host, tasks } = await connected()
      host.route('GET', PATH, () =>
        jsonResponse(200, { item: { ...RAW_TASK, taskRelationships: {} } })
      )
      // No PUT route: the fixture fetch rejects like a dropped connection.

      await expect(tasks.updateTaskBlockers(args)).resolves.toMatchObject({
        ok: false,
        outcome: 'unknown'
      })
    })

    it('maps a 404 on the write to dart.taskNotFound, notApplied', async () => {
      const { host, tasks } = await withRead({})
      host.route('PUT', PATH, () => jsonResponse(404, { errors: ['gone'] }))

      await expect(tasks.updateTaskBlockers(args)).resolves.toMatchObject({
        ok: false,
        errorCode: 'dart.taskNotFound',
        outcome: 'notApplied'
      })
    })
  })
})
