import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import { DartUpdateRequiredError } from '@/runtime/runtime-dart-client'
import type * as DartClient from '@/runtime/runtime-dart-client'
import { createTestStore } from '../store-test-helpers'

const clientMocks = vi.hoisted(() => ({
  dartStatus: vi.fn(),
  dartConnect: vi.fn(),
  dartDisconnect: vi.fn(),
  dartTestConnection: vi.fn(),
  dartListTasksForTarget: vi.fn(),
  dartGetTaskForTarget: vi.fn()
}))

vi.mock('@/runtime/runtime-dart-client', async (importOriginal) => ({
  ...(await importOriginal<typeof DartClient>()),
  ...clientMocks
}))

const NOW = new Date('2026-01-01T00:00:00Z').getTime()
const viewer = { id: 'u1AbCdEfGhIj', name: 'Alex Example', email: 'alex@example.com' }

function task(id: string): DartTask {
  return { id, title: `Task ${id}`, htmlUrl: `https://app.dartai.com/t/${id}`, tags: [] }
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW })
  for (const mock of Object.values(clientMocks)) {
    mock.mockReset()
  }
})

describe('dart slice connection', () => {
  it('stores the connected status and marks the check as done', async () => {
    clientMocks.dartStatus.mockResolvedValue({ connected: true, viewer })
    const store = createTestStore()

    await store.getState().checkDartConnection()

    expect(store.getState()).toMatchObject({
      dartStatus: { connected: true, viewer },
      dartStatusChecked: true,
      dartUpdateRequired: false
    })
  })

  it('flags an old remote server instead of reporting a plain disconnect', async () => {
    clientMocks.dartStatus.mockRejectedValue(new DartUpdateRequiredError())
    const store = createTestStore()
    store.setState({ dartStatus: { connected: true, viewer }, dartStatusChecked: true })

    await store.getState().checkDartConnection()

    expect(store.getState()).toMatchObject({
      dartStatus: { connected: false, viewer: null },
      dartStatusChecked: true,
      dartUpdateRequired: true
    })
  })

  it('connects, drops cached reads and returns host failures untouched', async () => {
    const store = createTestStore()
    store.setState({
      dartListCache: { stale: { data: { tasks: [], totalCount: 0 }, fetchedAt: NOW } }
    })
    clientMocks.dartStatus.mockResolvedValue({ connected: true, viewer })
    clientMocks.dartConnect.mockResolvedValueOnce({ ok: true, viewer })

    await expect(store.getState().connectDart({ apiToken: 'dsa_FAKE' })).resolves.toEqual({
      ok: true,
      viewer
    })
    expect(store.getState().dartStatus).toMatchObject({ connected: true, viewer })
    expect(store.getState().dartListCache).toEqual({})

    const failure = {
      ok: false,
      error: 'Dart rejected the API token.',
      errorCode: 'dart.unauthorized'
    }
    clientMocks.dartConnect.mockResolvedValueOnce(failure)
    await expect(store.getState().connectDart({ apiToken: 'dsa_BAD' })).resolves.toEqual(failure)
    expect(store.getState().dartStatus.connected).toBe(true)
  })

  it('disconnect clears the viewer and cached reads', async () => {
    const store = createTestStore()
    store.setState({
      dartStatus: { connected: true, viewer },
      dartTaskCache: { k: { data: task('aB3dE5gH7jK9'), fetchedAt: NOW } }
    })
    clientMocks.dartDisconnect.mockResolvedValue({ ok: true })
    clientMocks.dartStatus.mockResolvedValue({ connected: false, viewer: null })

    await store.getState().disconnectDart()

    expect(store.getState().dartStatus).toEqual({ connected: false, viewer: null })
    expect(store.getState().dartTaskCache).toEqual({})
  })
})

describe('dart slice reads', () => {
  it('serves a repeat list from cache, shares concurrent requests and refetches on force', async () => {
    clientMocks.dartListTasksForTarget.mockResolvedValue({
      ok: true,
      tasks: [task('aB3dE5gH7jK9')],
      totalCount: 1
    })
    const store = createTestStore()
    const args = { assigneeId: viewer.id }

    const [first, second] = await Promise.all([
      store.getState().listDartTasks(args),
      store.getState().listDartTasks(args)
    ])
    expect(first).toMatchObject({ ok: true, totalCount: 1 })
    expect(second).toBe(first)
    expect(clientMocks.dartListTasksForTarget).toHaveBeenCalledTimes(1)

    await store.getState().listDartTasks(args)
    expect(clientMocks.dartListTasksForTarget).toHaveBeenCalledTimes(1)

    await store.getState().listDartTasks(args, { force: true })
    expect(clientMocks.dartListTasksForTarget).toHaveBeenCalledTimes(2)

    await store.getState().listDartTasks({ assigneeId: viewer.id, status: 'To-do' })
    expect(clientMocks.dartListTasksForTarget).toHaveBeenCalledTimes(3)
  })

  it('does not cache failures and marks the connection lost on an auth failure', async () => {
    clientMocks.dartGetTaskForTarget.mockResolvedValue({
      ok: false,
      error: 'Dart rejected the API token.',
      errorCode: 'dart.unauthorized'
    })
    const store = createTestStore()
    store.setState({ dartStatus: { connected: true, viewer }, dartStatusChecked: true })

    const result = await store.getState().fetchDartTask('aB3dE5gH7jK9')

    expect(result).toMatchObject({ ok: false, errorCode: 'dart.unauthorized' })
    expect(store.getState().dartTaskCache).toEqual({})
    expect(store.getState().dartStatus).toEqual({ connected: false, viewer: null })
  })

  it('turns a transport error into a failure result instead of throwing', async () => {
    clientMocks.dartGetTaskForTarget.mockRejectedValue(new Error('socket closed'))
    const store = createTestStore()

    await expect(store.getState().fetchDartTask('aB3dE5gH7jK9')).resolves.toEqual({
      ok: false,
      error: 'socket closed'
    })
  })
})
