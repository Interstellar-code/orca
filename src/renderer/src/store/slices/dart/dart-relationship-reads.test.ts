// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestStore } from '../store-test-helpers'
import { dartTaskFixture, installFakeDartRuntime } from './dart-fake-runtime.test-support'
import { relationshipsFixture } from './dart-fake-relationships.test-support'
import { getDartReadScope, scopedDartCacheKey } from './dart-read-coordination'
import { dartTaskIdentity, dartTaskIdentityKey } from './dart-task-identity'

const ENV = 'relationship-reads-host'
const PARENT_ID = 'parent000001'
const viewer = { id: 'user-a', name: 'Alex Example' }

let runtime: ReturnType<typeof installFakeDartRuntime>

function taskId(index: number): string {
  return `task${String(index).padStart(8, '0')}`
}

function openStore(options: { relationships?: boolean } = {}) {
  const host = runtime.host(ENV)
  host.relationships = options.relationships ?? true
  const store = createTestStore()
  const settings = { ...store.getState().settings!, activeRuntimeEnvironmentId: ENV }
  const scope = getDartReadScope(settings)
  store.setState({
    settings,
    dartStatus: { connected: true, viewer },
    dartStatusChecked: true,
    dartStatusContextKey: scope.contextKey
  })
  return { host, store, scope }
}

beforeEach(() => {
  runtime = installFakeDartRuntime()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('dart subtask reads', () => {
  it('stores a child read only under its children key, where a task patch reaches it', async () => {
    const { host, store, scope } = openStore()
    host.addTask(dartTaskFixture(PARENT_ID))
    host.addTask(dartTaskFixture(taskId(1), { parentId: PARENT_ID, status: 'To-do' }))
    host.addTask(dartTaskFixture(taskId(2), { parentId: 'other0000001' }))

    const result = await store.getState().readDartSubtasks(PARENT_ID)

    expect(result).toMatchObject({ ok: true, total: 1, tasks: [{ id: taskId(1) }] })
    const childrenKey = scopedDartCacheKey(scope, `list::children::${PARENT_ID}`)
    expect(Object.keys(store.getState().dartListCache)).toEqual([childrenKey])
    expect(host.requestsOf('dart.listTasks')).toEqual([{ parentId: PARENT_ID, limit: 250 }])

    store
      .getState()
      .patchDartTask(dartTaskIdentity(scope, taskId(1), viewer.id), { status: 'Doing' })

    expect(store.getState().dartListCache[childrenKey]?.data?.tasks[0]?.status).toBe('Doing')
  })

  it('reads nothing from a host without relationships', async () => {
    const { host, store } = openStore({ relationships: false })

    const result = await store.getState().readDartSubtasks(PARENT_ID)

    expect(result.ok).toBe(false)
    expect(host.count('dart.listTasks')).toBe(0)
    expect(store.getState().dartListCache).toEqual({})
  })
})

describe('dart reads by id', () => {
  it('sends 3 requests of at most 100 ids for 250 ids', async () => {
    const { host, store } = openStore()
    host.addTask(dartTaskFixture(taskId(0), { title: 'First' }))
    const ids = Array.from({ length: 250 }, (_, index) => taskId(index))

    const result = await store.getState().readDartTasksByIds(ids)

    expect(result).toMatchObject({
      ok: true,
      total: 250,
      complete: true,
      tasks: [{ id: taskId(0) }]
    })
    const sizes = host.requestsOf('dart.listTasks').map((params) => params.ids?.length)
    expect(sizes).toEqual([100, 100, 50])
  })

  it('stops at 3 requests for 350 ids and reports it is incomplete', async () => {
    const { host, store } = openStore()
    const ids = Array.from({ length: 350 }, (_, index) => taskId(index))

    const result = await store.getState().readDartTasksByIds(ids)

    expect(result).toMatchObject({ ok: true, total: 350, complete: false })
    expect(host.count('dart.listTasks')).toBe(3)
    expect(store.getState().dartListCache).toEqual({})
  })

  it('keeps total and complete apart for concurrent reads that share their first 300 ids', async () => {
    const { store } = openStore()
    const ids = Array.from({ length: 350 }, (_, index) => taskId(index))

    const [exact, over] = await Promise.all([
      store.getState().readDartTasksByIds(ids.slice(0, 300)),
      store.getState().readDartTasksByIds(ids)
    ])

    expect(exact).toMatchObject({ ok: true, total: 300, complete: true })
    expect(over).toMatchObject({ ok: true, total: 350, complete: false })
  })
})

describe('dart blocker search', () => {
  it('sends title, open tasks and 25 rows, adds the dartboard only when given, and caches nothing', async () => {
    const { host, store } = openStore()
    host.addTask(dartTaskFixture(taskId(1), { title: 'Fix login' }))

    await expect(store.getState().searchDartTasks('login', {})).resolves.toMatchObject({
      ok: true,
      tasks: [{ id: taskId(1) }]
    })
    await store.getState().searchDartTasks('login', { dartboard: 'Team/Board' })

    expect(host.requestsOf('dart.listTasks')).toEqual([
      { title: 'login', isCompleted: false, limit: 25 },
      { title: 'login', isCompleted: false, limit: 25, dartboard: 'Team/Board' }
    ])
    expect(store.getState().dartListCache).toEqual({})
    expect(store.getState().dartTaskCache).toEqual({})
  })
})

describe('dart on-hold relationship reads', () => {
  const blocked = relationshipsFixture({ blockerIds: ['blocker00001'] })

  function addOnHoldTasks(host: ReturnType<typeof openStore>['host'], count: number): string[] {
    const ids = Array.from({ length: count }, (_, index) => taskId(index))
    for (const id of ids) {
      host.addTask(dartTaskFixture(id, { status: 'On hold', relationships: blocked }))
    }
    return ids
  }

  it('reads at most 20 tasks in order, never others, and reports the rest as not checked', async () => {
    const { host, store, scope } = openStore()
    const ids = addOnHoldTasks(host, 25)
    host.addTask(dartTaskFixture('bystander001', { relationships: blocked }))

    await store.getState().readDartOnHoldRelationships(ids)

    expect(host.requestsOf('dart.getTask').map((params) => params.taskId)).toEqual(ids.slice(0, 20))
    const cache = store.getState().dartRelationshipCache
    const entryOf = (id: string) =>
      cache[dartTaskIdentityKey(dartTaskIdentity(scope, id, viewer.id))]
    expect(Object.keys(cache)).toHaveLength(25)
    expect(entryOf(ids[0])).toMatchObject({ state: 'known', relationships: blocked, error: null })
    expect(entryOf(ids[19])?.state).toBe('known')
    expect(entryOf(ids[20])).toMatchObject({ state: 'notChecked', relationships: null })
    expect(entryOf('bystander001')).toBeUndefined()
  })

  it('reads again on the next read set and keeps a failed or link-less task not checked', async () => {
    const { host, store, scope } = openStore()
    const [first] = addOnHoldTasks(host, 1)
    host.addTask(dartTaskFixture('nolinks00001', { status: 'On hold' }))
    const ids = [first, 'nolinks00001', 'missing00001']

    await store.getState().readDartOnHoldRelationships(ids)
    await store.getState().readDartOnHoldRelationships(ids)

    expect(host.count('dart.getTask')).toBe(6)
    const entryOf = (id: string) =>
      store.getState().dartRelationshipCache[
        dartTaskIdentityKey(dartTaskIdentity(scope, id, viewer.id))
      ]
    expect(entryOf('nolinks00001')).toMatchObject({ state: 'notChecked', relationships: null })
    expect(entryOf('missing00001')).toMatchObject({ state: 'error', relationships: null })
    expect(entryOf('missing00001')?.error).toEqual(expect.any(String))
  })

  it('stamps the given publication id on every entry it writes and leaves entries unstamped without one', async () => {
    const { host, store, scope } = openStore()
    const ids = [...addOnHoldTasks(host, 2), 'missing00001']
    const entryOf = (id: string) =>
      store.getState().dartRelationshipCache[
        dartTaskIdentityKey(dartTaskIdentity(scope, id, viewer.id))
      ]

    await store.getState().readDartOnHoldRelationships(ids)
    expect(ids.map((id) => entryOf(id)?.publicationId)).toEqual([undefined, undefined, undefined])

    await store.getState().readDartOnHoldRelationships(ids, { publicationId: 7 })
    expect(entryOf(ids[0])).toMatchObject({ state: 'known', publicationId: 7 })
    expect(entryOf(ids[2])).toMatchObject({ state: 'error', publicationId: 7 })
  })

  it('marks the on-hold read publication on the scope meta only while that publication is current', () => {
    const { store } = openStore()
    const meta = { openTotal: 0, doneTotal: 0, doneOffset: 0, generation: 1, fetchedAt: 1 }
    store.setState({
      dartScopeMetaCache: {
        current: { ...meta, incomplete: false, partialReason: null, publicationId: 4 },
        replaced: { ...meta, incomplete: false, partialReason: null, publicationId: 9 }
      }
    })

    store.getState().markDartOnHoldReadPublication('current', 4)
    store.getState().markDartOnHoldReadPublication('replaced', 4)

    expect(store.getState().dartScopeMetaCache.current?.onHoldReadPublicationId).toBe(4)
    expect(store.getState().dartScopeMetaCache.replaced?.onHoldReadPublicationId).toBeUndefined()
  })

  it('is emptied by connect and by disconnect', async () => {
    const { host, store } = openStore()
    const ids = addOnHoldTasks(host, 2)

    await store.getState().readDartOnHoldRelationships(ids)
    expect(Object.keys(store.getState().dartRelationshipCache)).toHaveLength(2)
    await store.getState().connectDart({ apiToken: 'dsa_FAKE' })
    expect(store.getState().dartRelationshipCache).toEqual({})

    await store.getState().readDartOnHoldRelationships(ids)
    expect(Object.keys(store.getState().dartRelationshipCache)).toHaveLength(2)
    await store.getState().disconnectDart()
    expect(store.getState().dartRelationshipCache).toEqual({})
  })

  describe('with a read in flight', () => {
    const cleared = relationshipsFixture({ blockerIds: ['blocker00002'] })

    function setup(count: number) {
      const opened = openStore()
      const ids = addOnHoldTasks(opened.host, count)
      const entryOf = (id: string) =>
        opened.store.getState().dartRelationshipCache[
          dartTaskIdentityKey(dartTaskIdentity(opened.scope, id, viewer.id))
        ]
      return { ...opened, ids, entryOf }
    }

    it('keeps a newer read when an overtaken one replies late', async () => {
      const { host, store, ids, entryOf } = setup(1)
      const release = host.hold('dart.getTask')
      const overtaken = store.getState().readDartOnHoldRelationships(ids)
      await vi.waitFor(() => expect(host.count('dart.getTask')).toBe(1))
      host.addTask(dartTaskFixture(ids[0], { status: 'On hold', relationships: cleared }))

      await store.getState().readDartOnHoldRelationships(ids)
      release()
      await overtaken

      expect(entryOf(ids[0])).toMatchObject({ state: 'known', relationships: cleared })
    })

    it('keeps an entry written to the cache after the read started', async () => {
      const { host, store, scope, ids, entryOf } = setup(1)
      const release = host.hold('dart.getTask')
      const read = store.getState().readDartOnHoldRelationships(ids)
      await vi.waitFor(() => expect(host.count('dart.getTask')).toBe(1))
      const written = { state: 'known', relationships: cleared, fetchedAt: 1, error: null } as const
      const key = dartTaskIdentityKey(dartTaskIdentity(scope, ids[0], viewer.id))
      store.setState((state) => ({
        dartRelationshipCache: { ...state.dartRelationshipCache, [key]: written }
      }))

      release()
      await read

      expect(entryOf(ids[0])).toBe(written)
    })

    it('puts unread targets back to what they were when the host changes', async () => {
      const { host, store, ids, entryOf } = setup(3)
      await store.getState().readDartOnHoldRelationships(ids.slice(0, 1))
      const known = entryOf(ids[0])
      const release = host.hold('dart.getTask')
      const read = store.getState().readDartOnHoldRelationships(ids)
      await vi.waitFor(() => expect(host.count('dart.getTask')).toBe(2))
      store.setState({
        settings: { ...store.getState().settings!, activeRuntimeEnvironmentId: 'other-host' }
      })

      release()
      await read

      expect(host.count('dart.getTask')).toBe(2)
      expect(entryOf(ids[0])).toBe(known)
      expect(entryOf(ids[1])).toMatchObject({ state: 'notChecked', relationships: null })
      expect(entryOf(ids[2])).toMatchObject({ state: 'notChecked', relationships: null })
    })

    it('puts unread targets back to not checked when Dart refuses the token', async () => {
      const { store, ids, entryOf } = setup(3)
      store.setState({
        fetchDartTask: async () => ({
          ok: false,
          error: 'Dart token rejected.',
          errorCode: 'dart.unauthorized'
        })
      })

      await store.getState().readDartOnHoldRelationships(ids)

      expect(entryOf(ids[0])).toMatchObject({ state: 'error', error: 'Dart token rejected.' })
      expect(entryOf(ids[1])).toMatchObject({ state: 'notChecked', relationships: null })
      expect(entryOf(ids[2])).toMatchObject({ state: 'notChecked', relationships: null })
    })

    it('leaves the emptied cache empty when a disconnect interrupts the read', async () => {
      const { host, store, ids } = setup(2)
      const release = host.hold('dart.getTask')
      const read = store.getState().readDartOnHoldRelationships(ids)
      await vi.waitFor(() => expect(host.count('dart.getTask')).toBe(1))
      await store.getState().disconnectDart()

      release()
      await read

      expect(store.getState().dartRelationshipCache).toEqual({})
    })
  })
})
