// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import type { DartServerFilters } from '@/components/task-page/dart/dart-board-contracts'
import { createTestStore } from '../store-test-helpers'
import {
  dartTaskFixture,
  installFakeDartRuntime,
  type FakeDartHost
} from './dart-fake-runtime.test-support'
import { getDartReadScope } from './dart-read-coordination'
import { dartTaskIdentity } from './dart-task-identity'

const FILTERS: DartServerFilters = { mine: false, dartboard: null, search: '' }
const FEATURES = { board: true }
const VIEWER = { id: 'user-a', name: 'Alex Example' }
const REMOTE = 'scope-read-remote'
const T0 = Date.UTC(2026, 0, 1)

let runtime: ReturnType<typeof installFakeDartRuntime>
let store: ReturnType<typeof createTestStore>

function openTask(index: number, overrides: Partial<DartTask> = {}): DartTask {
  return dartTaskFixture(`open-${String(index).padStart(4, '0')}`, {
    title: `Open ${index}`,
    updatedAt: new Date(T0).toISOString(),
    completedAt: null,
    assignee: VIEWER.name,
    ...overrides
  })
}

// A higher index finished earlier, so `-completed_at` lists the done tasks by ascending index.
function doneTask(index: number, overrides: Partial<DartTask> = {}): DartTask {
  return dartTaskFixture(`done-${String(index).padStart(4, '0')}`, {
    title: `Done ${index}`,
    status: 'Done',
    updatedAt: new Date(T0).toISOString(),
    completedAt: new Date(T0 + (10_000 - index) * 60_000).toISOString(),
    assignee: VIEWER.name,
    ...overrides
  })
}

function seed(host: FakeDartHost, open: number, done = 0): void {
  for (let i = 0; i < open; i += 1) {
    host.addTask(openTask(i))
  }
  for (let i = 0; i < done; i += 1) {
    host.addTask(doneTask(i))
  }
}

function listRequests(host: FakeDartHost) {
  return host.requests.filter((request) => request.method === 'dart.listTasks')
}

function openOffsets(host: FakeDartHost): (number | undefined)[] {
  return listRequests(host)
    .filter((request) => request.params.isCompleted === false)
    .map((request) => request.params.offset)
}

function defaultScope() {
  return getDartReadScope(store.getState().settings)
}

function connectViewer(): void {
  store.setState({
    dartStatus: { connected: true, viewer: VIEWER },
    dartStatusChecked: true,
    dartStatusContextKey: getDartReadScope(store.getState().settings).contextKey
  })
}

async function readAndPublish(filters: DartServerFilters = FILTERS, current = true) {
  const result = await store
    .getState()
    .readDartScope(filters, { features: FEATURES, scope: defaultScope() })
  store.getState().publishDartScope(filters, { result, current, scope: defaultScope() })
  return result
}

function mountedEntry() {
  const state = store.getState()
  const key = state.dartMountedScopeKey
  return {
    key: key ?? '',
    entry: key ? state.dartListCache[key] : undefined,
    meta: key ? state.dartScopeMetaCache[key] : undefined
  }
}

beforeEach(() => {
  runtime = installFakeDartRuntime()
  store = createTestStore()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('readDartScope paging', () => {
  it('stops after 4 open pages', async () => {
    const host = runtime.host(null)
    seed(host, 1300)

    const result = await store
      .getState()
      .readDartScope(FILTERS, { features: FEATURES, scope: defaultScope() })

    expect(openOffsets(host)).toEqual([0, 250, 500, 750])
    expect(result).toMatchObject({ openTotal: 1300, failure: null, incomplete: false })
    expect(result.tasks).toHaveLength(1000)
  })

  it('stops at a short page', async () => {
    const host = runtime.host(null)
    seed(host, 600)

    const result = await store
      .getState()
      .readDartScope(FILTERS, { features: FEATURES, scope: defaultScope() })

    expect(openOffsets(host)).toEqual([0, 250, 500])
    expect(result.tasks).toHaveLength(600)
  })

  it('stops when the offset reaches the total, even on a full page', async () => {
    const host = runtime.host(null)
    seed(host, 500)

    await store.getState().readDartScope(FILTERS, { features: FEATURES, scope: defaultScope() })

    expect(openOffsets(host)).toEqual([0, 250])
  })

  it('advances the offset by the raw row count and goes on when the count says more', async () => {
    const host = runtime.host(null)
    seed(host, 251)
    host.unmappableIds.add(openTask(7).id)

    const result = await store
      .getState()
      .readDartScope(FILTERS, { features: FEATURES, scope: defaultScope() })

    expect(openOffsets(host)).toEqual([0, 250])
    expect(result.tasks).toHaveLength(250)
    expect(result).toMatchObject({ openTotal: 251, incomplete: true })
  })

  it('fails the read set when a reply carries no raw counts', async () => {
    const host = runtime.host(null)
    seed(host, 10)
    host.omitRaw = true

    const result = await store
      .getState()
      .readDartScope(FILTERS, { features: FEATURES, scope: defaultScope() })

    expect(result.failure?.reason).toBe('error')
    expect(result.incomplete).toBe(true)
    expect(listRequests(host)).toHaveLength(1)
  })

  it('asks open pages and the first finished page with their own order and size', async () => {
    const host = runtime.host(null)
    seed(host, 3, 3)

    await store.getState().readDartScope(FILTERS, { features: FEATURES, scope: defaultScope() })

    expect(listRequests(host).map((request) => request.params)).toEqual([
      { isCompleted: false, order: 'order', limit: 250, offset: 0 },
      { isCompleted: true, order: '-completed_at', limit: 50, offset: 0 }
    ])
  })

  it('sends no request on a host without the board', async () => {
    const host = runtime.host(null)
    seed(host, 3)

    const result = await store
      .getState()
      .readDartScope(FILTERS, { features: { board: false }, scope: defaultScope() })

    expect(result.failure?.reason).toBe('error')
    expect(listRequests(host)).toHaveLength(0)
  })

  it('reports the open and finished totals and the finished cursor', async () => {
    seed(runtime.host(null), 4, 120)

    const result = await store
      .getState()
      .readDartScope(FILTERS, { features: FEATURES, scope: defaultScope() })

    expect(result).toMatchObject({ openTotal: 4, doneTotal: 120, doneOffset: 50 })
    expect(result.tasks).toHaveLength(54)
  })
})

describe('readDartScope incompleteness', () => {
  it('marks the read set incomplete when the finished page is short before its total', async () => {
    const host = runtime.host(null)
    seed(host, 3, 120)
    host.maxRowsPerPage = 20

    const result = await store
      .getState()
      .readDartScope(FILTERS, { features: FEATURES, scope: defaultScope() })

    expect(result).toMatchObject({ doneTotal: 120, doneOffset: 20, incomplete: true })
  })

  it('marks the read set incomplete when Dart count moves between open pages', async () => {
    const host = runtime.host(null)
    seed(host, 600)
    const release = host.hold('dart.listTasks')

    const pending = store
      .getState()
      .readDartScope(FILTERS, { features: FEATURES, scope: defaultScope() })
    await vi.waitFor(() => expect(listRequests(host)).toHaveLength(1))
    for (let i = 0; i < 10; i += 1) {
      host.tasks.delete(openTask(i).id)
    }
    release()
    const result = await pending

    expect(result.openTotal).toBe(590)
    expect(result.incomplete).toBe(true)
  })

  it('stays complete when every page matches the count', async () => {
    seed(runtime.host(null), 600, 120)

    const result = await store
      .getState()
      .readDartScope(FILTERS, { features: FEATURES, scope: defaultScope() })

    expect(result.incomplete).toBe(false)
  })

  it('marks an uncut open read incomplete when an unmappable row leaves fewer tasks than the count', async () => {
    const host = runtime.host(null)
    seed(host, 10)
    host.unmappableIds.add(openTask(2).id)

    const uncut = await store
      .getState()
      .readDartScope(FILTERS, { features: FEATURES, scope: defaultScope() })

    expect(uncut).toMatchObject({ openTotal: 10, incomplete: true })
    expect(uncut.tasks).toHaveLength(9)

    for (let i = 10; i < 1300; i += 1) {
      host.addTask(openTask(i))
    }
    const cut = await store
      .getState()
      .readDartScope(FILTERS, { features: FEATURES, scope: defaultScope() })

    expect(cut).toMatchObject({ openTotal: 1300, incomplete: false })
  })
})

describe('readDartScope dedupe', () => {
  it('keeps the newer row at the first position when a task finishes between the open and finished reads', async () => {
    const host = runtime.host(null)
    seed(host, 3)
    const releaseOpen = host.hold('dart.listTasks')
    const releaseDone = host.hold('dart.listTasks')

    const pending = store
      .getState()
      .readDartScope(FILTERS, { features: FEATURES, scope: defaultScope() })
    await vi.waitFor(() => expect(listRequests(host)).toHaveLength(1))
    host.addTask(
      openTask(1, {
        title: 'Finished meanwhile',
        status: 'Done',
        completedAt: new Date(T0 + 60_000).toISOString(),
        updatedAt: new Date(T0 + 60_000).toISOString()
      })
    )
    releaseOpen()
    await vi.waitFor(() => expect(listRequests(host)).toHaveLength(2))
    releaseDone()
    const result = await pending

    expect(result.tasks.map((task) => task.id)).toEqual([
      openTask(0).id,
      openTask(1).id,
      openTask(2).id
    ])
    expect(result.tasks[1]).toMatchObject({ title: 'Finished meanwhile', status: 'Done' })
    expect(result.incomplete).toBe(true)
  })

  it('keeps the newer row when the same task comes back on the next open page', async () => {
    const host = runtime.host(null)
    seed(host, 400)
    const releaseFirst = host.hold('dart.listTasks')

    const pending = store
      .getState()
      .readDartScope(FILTERS, { features: FEATURES, scope: defaultScope() })
    await vi.waitFor(() => expect(listRequests(host)).toHaveLength(1))
    // A new first row pushes the boundary row onto page 2 as well.
    const shifted = openTask(249, {
      title: 'Edited at the boundary',
      updatedAt: new Date(T0 + 1000).toISOString()
    })
    host.tasks = new Map([
      [openTask(9999).id, openTask(9999)],
      ...[...host.tasks].map(([id, task]): [string, DartTask] => [
        id,
        id === shifted.id ? shifted : task
      ])
    ])
    releaseFirst()
    const result = await pending

    const ids = result.tasks.map((task) => task.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.indexOf(shifted.id)).toBe(249)
    expect(result.tasks[249].title).toBe('Edited at the boundary')
    expect(result.incomplete).toBe(true)
  })
})

describe('readDartScope isolation', () => {
  it('changes no cache', async () => {
    const host = runtime.host(null)
    seed(host, 5, 5)
    connectViewer()
    const before = store.getState()

    await store.getState().readDartScope(FILTERS, { features: FEATURES, scope: defaultScope() })

    const after = store.getState()
    expect(after.dartListCache).toBe(before.dartListCache)
    expect(after.dartTaskCache).toBe(before.dartTaskCache)
    expect(after.dartConfigCache).toBe(before.dartConfigCache)
    expect(after.dartScopeMetaCache).toBe(before.dartScopeMetaCache)
    expect(after.dartMountedScopeKey).toBeNull()
  })
})

describe('publishDartScope', () => {
  it('stores one entry and its metadata, with the open total in both', async () => {
    seed(runtime.host(null), 5, 3)
    connectViewer()

    await readAndPublish()

    const { key, entry, meta } = mountedEntry()
    expect(key).toContain('::list::scope::')
    expect(entry?.data?.tasks).toHaveLength(8)
    expect(entry?.data?.totalCount).toBe(5)
    expect(meta).toMatchObject({
      openTotal: 5,
      doneTotal: 3,
      doneOffset: 3,
      generation: 1,
      incomplete: false,
      partialReason: null
    })
  })

  it('keeps the previous entry and its age when page 3 of a refresh hits a rate limit', async () => {
    const host = runtime.host(null)
    seed(host, 600)
    connectViewer()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(T0)
    await readAndPublish()
    const first = mountedEntry()
    // The first read set took 4 requests, so the refresh's third page is request 7.
    host.failListRequest(7)
    vi.setSystemTime(T0 + 90_000)

    const result = await readAndPublish()

    expect(result.failure?.reason).toBe('rateLimited')
    const { entry, meta } = mountedEntry()
    expect(entry).toBe(first.entry)
    expect(meta).toEqual({ ...first.meta, partialReason: 'rateLimited' })
    expect(meta?.fetchedAt).toBe(T0)
  })

  it('publishes the pages it got, marked incomplete, when the first read hits a rate limit', async () => {
    const host = runtime.host(null)
    seed(host, 600)
    connectViewer()
    host.failListRequest(3)

    await readAndPublish()

    const { entry, meta } = mountedEntry()
    expect(entry?.data?.tasks).toHaveLength(500)
    expect(meta).toMatchObject({ incomplete: true, partialReason: 'rateLimited', openTotal: 600 })
    expect(entry?.data?.totalCount).toBe(600)
    // Only a complete read set counts as fresh: no age label, and a re-mount reads again.
    expect(meta?.fetchedAt).toBe(0)
    expect(entry?.fetchedAt).toBe(0)
  })

  it('keeps the entry and sets only the reason for a read set a write overtook', async () => {
    seed(runtime.host(null), 4)
    connectViewer()
    await readAndPublish()
    const first = mountedEntry()

    await readAndPublish(FILTERS, false)

    const { entry, meta } = mountedEntry()
    expect(entry).toBe(first.entry)
    expect(meta).toEqual({ ...first.meta, partialReason: 'changed' })
  })

  it('stores metadata only for an overtaken first read', async () => {
    seed(runtime.host(null), 4)
    connectViewer()

    await readAndPublish(FILTERS, false)

    const { key, entry, meta } = mountedEntry()
    expect(entry).toBeUndefined()
    expect(store.getState().dartListCache[key]).toBeUndefined()
    expect(meta).toMatchObject({ partialReason: 'changed', openTotal: 0 })
  })

  it('lets an overtaken read win over its failure and keeps the entry', async () => {
    const host = runtime.host(null)
    seed(host, 600)
    connectViewer()
    await readAndPublish()
    const first = mountedEntry()
    host.failListRequest(7)

    await readAndPublish(FILTERS, false)

    const { entry, meta } = mountedEntry()
    expect(entry).toBe(first.entry)
    expect(meta).toEqual({ ...first.meta, partialReason: 'changed' })
  })

  it('publishes no rows for a failed first read that a write overtook', async () => {
    const host = runtime.host(null)
    seed(host, 600)
    connectViewer()
    host.failListRequest(3)

    await readAndPublish(FILTERS, false)

    const { entry, meta } = mountedEntry()
    expect(entry).toBeUndefined()
    expect(meta).toMatchObject({ partialReason: 'changed', fetchedAt: 0 })
  })

  it('counts a replaced complete read as a new generation', async () => {
    seed(runtime.host(null), 4)
    connectViewer()
    await readAndPublish()
    await readAndPublish()

    expect(mountedEntry().meta?.generation).toBe(2)
  })

  it('keeps openTotal equal to the entry total after every publish', async () => {
    const host = runtime.host(null)
    seed(host, 600)
    connectViewer()
    host.failListRequest(7)
    const steps: [DartServerFilters, boolean][] = [
      [FILTERS, true],
      [FILTERS, true],
      [FILTERS, false],
      [{ ...FILTERS, search: 'Open 1' }, true]
    ]

    for (const [filters, current] of steps) {
      await readAndPublish(filters, current)
      const { entry, meta } = mountedEntry()
      expect(meta?.openTotal).toBe(entry?.data?.totalCount)
    }
  })
})

describe('mine filter', () => {
  it('sends nothing and publishes an empty scope when no viewer is known', async () => {
    const host = runtime.host(null)
    seed(host, 5)

    const result = await readAndPublish({ ...FILTERS, mine: true })

    expect(listRequests(host)).toHaveLength(0)
    expect(result.openTotal).toBe(0)
    const { entry, meta } = mountedEntry()
    expect(entry?.data).toMatchObject({ tasks: [], totalCount: 0 })
    expect(meta?.openTotal).toBe(0)
  })

  it('sends the store viewer id on every page, open and finished', async () => {
    const host = runtime.host(null)
    seed(host, 300, 3)
    connectViewer()

    await readAndPublish({ ...FILTERS, mine: true })

    const requests = listRequests(host)
    expect(requests).toHaveLength(3)
    expect(requests.every((request) => request.params.assigneeId === VIEWER.id)).toBe(true)
  })
})

describe('readMoreDone', () => {
  async function loaded(open: number, done: number, filters: DartServerFilters = FILTERS) {
    seed(runtime.host(null), open, done)
    connectViewer()
    await readAndPublish(filters)
  }

  function doneIds(): string[] {
    return (mountedEntry().entry?.data?.tasks ?? [])
      .filter((task) => task.id.startsWith('done-'))
      .map((task) => task.id)
  }

  it('reads the next 50 finished tasks by the stored offset and appends them', async () => {
    const host = runtime.host(null)
    await loaded(3, 120)

    const result = await store
      .getState()
      .readMoreDone(FILTERS, { features: FEATURES, scope: defaultScope() })

    expect(result).toEqual({ ok: true })
    expect(listRequests(host).at(-1)?.params).toEqual({
      isCompleted: true,
      order: '-completed_at',
      limit: 50,
      offset: 50
    })
    expect(doneIds()).toHaveLength(100)
    expect(mountedEntry().meta).toMatchObject({ doneOffset: 100, doneTotal: 120, generation: 1 })
  })

  it('reads by raw offset across three pages with no duplicate rows', async () => {
    const host = runtime.host(null)
    await loaded(3, 400)
    await store.getState().readMoreDone(FILTERS, { features: FEATURES, scope: defaultScope() })
    await store.getState().readMoreDone(FILTERS, { features: FEATURES, scope: defaultScope() })
    const requestsBefore = listRequests(host).length

    await store.getState().readMoreDone(FILTERS, { features: FEATURES, scope: defaultScope() })

    expect(listRequests(host)).toHaveLength(requestsBefore + 1)
    expect(listRequests(host).at(-1)?.params.offset).toBe(150)
    const ids = doneIds()
    expect(ids).toHaveLength(200)
    expect(new Set(ids).size).toBe(200)
    expect(mountedEntry().meta?.generation).toBe(1)
  })

  it('keeps the cursor and sends nothing while a client filter changes, then reads the next raw offset', async () => {
    const host = runtime.host(null)
    await loaded(3, 400)
    await store.getState().readMoreDone(FILTERS, { features: FEATURES, scope: defaultScope() })
    await store.getState().readMoreDone(FILTERS, { features: FEATURES, scope: defaultScope() })
    const before = mountedEntry()
    const requestsBefore = listRequests(host).length
    const idsBefore = doneIds()

    // The client filter is page state: it narrows what is shown and never reaches the store or the host.
    const shown = (before.entry?.data?.tasks ?? []).filter((task) => task.status === 'Done')

    expect(shown.length).toBeGreaterThan(0)
    expect(listRequests(host)).toHaveLength(requestsBefore)
    expect(mountedEntry().meta).toMatchObject({ doneOffset: 150, generation: 1 })
    expect(mountedEntry().meta).toBe(before.meta)
    expect(doneIds()).toEqual(idsBefore)

    await store.getState().readMoreDone(FILTERS, { features: FEATURES, scope: defaultScope() })

    expect(listRequests(host)).toHaveLength(requestsBefore + 1)
    expect(listRequests(host).at(-1)?.params.offset).toBe(150)
    expect(mountedEntry().meta).toMatchObject({ doneOffset: 200, generation: 1 })
    const ids = doneIds()
    expect(ids).toHaveLength(200)
    expect(new Set(ids).size).toBe(200)
  })

  it('advances the cursor by raw rows when some are unmappable', async () => {
    const host = runtime.host(null)
    await loaded(3, 120)
    host.unmappableIds.add(doneTask(60).id)

    await store.getState().readMoreDone(FILTERS, { features: FEATURES, scope: defaultScope() })
    await store.getState().readMoreDone(FILTERS, { features: FEATURES, scope: defaultScope() })

    expect(listRequests(host).at(-1)?.params.offset).toBe(100)
    expect(mountedEntry().meta?.doneOffset).toBe(120)
  })

  it('drops a reply that lands after a refresh and restarts the cursor with the new read set', async () => {
    const host = runtime.host(null)
    await loaded(3, 120)
    const release = host.hold('dart.listTasks')

    const more = store
      .getState()
      .readMoreDone(FILTERS, { features: FEATURES, scope: defaultScope() })
    await vi.waitFor(() => expect(listRequests(host)).toHaveLength(3))
    await readAndPublish()
    release()
    await more

    expect(doneIds()).toHaveLength(50)
    expect(mountedEntry().meta).toMatchObject({ doneOffset: 50, generation: 2 })
  })

  it('drops a reply that lands after a refresh has started, before it publishes', async () => {
    const host = runtime.host(null)
    await loaded(3, 120)
    const releaseMore = host.hold('dart.listTasks')

    const more = store
      .getState()
      .readMoreDone(FILTERS, { features: FEATURES, scope: defaultScope() })
    await vi.waitFor(() => expect(listRequests(host)).toHaveLength(3))
    const releaseRefresh = host.hold('dart.listTasks')
    const refresh = store
      .getState()
      .readDartScope(FILTERS, { features: FEATURES, scope: defaultScope() })
    await vi.waitFor(() => expect(listRequests(host)).toHaveLength(4))
    releaseMore()
    await more

    expect(doneIds()).toHaveLength(50)
    expect(mountedEntry().meta).toMatchObject({ doneOffset: 50, generation: 1 })
    releaseRefresh()
    await refresh
  })

  it('drops a reply that lands after a server-filter change', async () => {
    const host = runtime.host(null)
    await loaded(3, 120)
    const firstKey = mountedEntry().key
    const release = host.hold('dart.listTasks')

    const more = store
      .getState()
      .readMoreDone(FILTERS, { features: FEATURES, scope: defaultScope() })
    await vi.waitFor(() => expect(listRequests(host)).toHaveLength(3))
    await readAndPublish({ ...FILTERS, search: 'Done 1' })
    release()
    await more

    const state = store.getState()
    expect(state.dartMountedScopeKey).not.toBe(firstKey)
    expect(
      state.dartListCache[firstKey]?.data?.tasks.filter((task) => task.id.startsWith('done-'))
    ).toHaveLength(50)
    expect(state.dartScopeMetaCache[firstKey]?.doneOffset).toBe(50)
  })

  it('carries the store viewer id like the open pages did', async () => {
    const host = runtime.host(null)
    await loaded(3, 120, { ...FILTERS, mine: true })

    await store
      .getState()
      .readMoreDone({ ...FILTERS, mine: true }, { features: FEATURES, scope: defaultScope() })

    expect(listRequests(host).at(-1)?.params).toMatchObject({
      isCompleted: true,
      assigneeId: VIEWER.id
    })
  })

  it('sends nothing for mine without a viewer id in the store', async () => {
    const host = runtime.host(null)
    await loaded(3, 120, { ...FILTERS, mine: true })
    store.setState({ dartStatus: { connected: true, viewer: null } })
    const requestsBefore = listRequests(host).length

    const result = await store
      .getState()
      .readMoreDone({ ...FILTERS, mine: true }, { features: FEATURES, scope: defaultScope() })

    expect(result).toEqual({ ok: true })
    expect(listRequests(host)).toHaveLength(requestsBefore)
    expect(doneIds()).toHaveLength(50)
  })

  it('leaves the entry and cursor alone when the read fails', async () => {
    const host = runtime.host(null)
    await loaded(3, 120)
    const before = mountedEntry()
    host.failListRequest(3)

    const result = await store
      .getState()
      .readMoreDone(FILTERS, { features: FEATURES, scope: defaultScope() })

    expect(result).toMatchObject({ ok: false, errorCode: 'dart.rateLimited' })
    expect(mountedEntry().entry).toBe(before.entry)
    expect(mountedEntry().meta).toBe(before.meta)
  })

  it('sends nothing before any read set is published', async () => {
    const host = runtime.host(null)
    seed(host, 3, 120)

    const result = await store
      .getState()
      .readMoreDone(FILTERS, { features: FEATURES, scope: defaultScope() })

    expect(result).toEqual({ ok: true })
    expect(listRequests(host)).toHaveLength(0)
  })
})

describe('phase 2 patching on the scope entry', () => {
  const sourceContext = (userId: string): TaskSourceContext => ({
    kind: 'task-source',
    provider: 'dart',
    projectId: 'project-1',
    hostId: 'local',
    providerIdentity: { provider: 'dart', userId }
  })

  it('patches and stales the entry of its own host only', async () => {
    seed(runtime.host(null), 3)
    seed(runtime.host(REMOTE), 3)
    connectViewer()
    await readAndPublish()
    const localKey = mountedEntry().key
    store.setState({
      settings: { ...store.getState().settings!, activeRuntimeEnvironmentId: REMOTE },
      dartStatusContextKey: getDartReadScope({ activeRuntimeEnvironmentId: REMOTE }).contextKey
    })
    await readAndPublish()
    const remoteKey = mountedEntry().key
    const remoteBefore = store.getState().dartListCache[remoteKey]
    const localScope = getDartReadScope({ activeRuntimeEnvironmentId: null })
    const identity = dartTaskIdentity(localScope, openTask(1).id, VIEWER.id)

    store.getState().patchDartTask(identity, { status: 'Review' })

    const local = store.getState().dartListCache[localKey]
    expect(local?.data?.tasks.find((task) => task.id === openTask(1).id)?.status).toBe('Review')
    expect(local?.fetchedAt).toBe(0)
    expect(store.getState().dartListCache[remoteKey]).toBe(remoteBefore)

    store
      .getState()
      .invalidateDartLists({ hostKey: identity.hostKey, accountKey: identity.accountKey })
    expect(store.getState().dartListCache[remoteKey]).toBe(remoteBefore)
  })

  it('reaches the scope entry through an explicit-scope identity of the same host and account', async () => {
    seed(runtime.host(null), 3)
    connectViewer()
    await readAndPublish()
    const key = mountedEntry().key
    const context = sourceContext(VIEWER.id)
    await store.getState().fetchDartTask(openTask(1).id, { sourceContext: context })
    const detailIdentity = dartTaskIdentity(
      getDartReadScope(store.getState().settings, context),
      openTask(1).id,
      VIEWER.id
    )

    store.getState().patchDartTask(detailIdentity, { status: 'Review' })
    expect(store.getState().dartListCache[key]?.data?.tasks[1].status).toBe('Review')

    store.setState((state) => ({
      dartListCache: {
        ...state.dartListCache,
        [key]: { ...state.dartListCache[key], fetchedAt: 5 }
      }
    }))
    store.getState().invalidateDartLists(detailIdentity)
    expect(store.getState().dartListCache[key]?.fetchedAt).toBe(0)
  })

  it('leaves the entry alone for the identity of a different account', async () => {
    seed(runtime.host(null), 3)
    connectViewer()
    await readAndPublish()
    const key = mountedEntry().key
    const before = store.getState().dartListCache[key]
    const otherContext = sourceContext('user-b')
    await store.getState().fetchDartTask(openTask(1).id, { sourceContext: otherContext })
    const otherIdentity = dartTaskIdentity(
      getDartReadScope(store.getState().settings, otherContext),
      openTask(1).id,
      'user-b'
    )

    store.getState().patchDartTask(otherIdentity, { status: 'Review' })
    store.getState().invalidateDartLists(otherIdentity)

    expect(store.getState().dartListCache[key]).toBe(before)
  })

  it('does not let 300 other list entries evict the entry right after a patch', async () => {
    seed(runtime.host(null), 3)
    connectViewer()
    await readAndPublish()
    const key = mountedEntry().key
    const scope = getDartReadScope(store.getState().settings)
    store.getState().patchDartTask(dartTaskIdentity(scope, openTask(1).id, VIEWER.id), {
      status: 'Review'
    })
    store.setState((state) => ({
      dartListCache: {
        ...state.dartListCache,
        ...Object.fromEntries(
          Array.from({ length: 300 }, (_, i): [string, (typeof state.dartListCache)[string]] => [
            `other::list::${i}`,
            { data: { tasks: [], totalCount: 0 }, fetchedAt: 1000 + i }
          ])
        )
      }
    }))

    await store.getState().listDartTasks({ status: 'To-do' }, { force: true })

    expect(store.getState().dartListCache[key]?.data?.tasks).toHaveLength(3)
    expect(store.getState().dartScopeMetaCache[key]).toBeDefined()
  })
})

describe('connection changes', () => {
  it('empties the metadata on connect and disconnect', async () => {
    seed(runtime.host(null), 3)
    connectViewer()
    await readAndPublish()
    expect(Object.keys(store.getState().dartScopeMetaCache)).toHaveLength(1)

    await store.getState().connectDart({ apiToken: 'unused-token' })
    expect(store.getState().dartScopeMetaCache).toEqual({})
    expect(store.getState().dartListCache).toEqual({})

    connectViewer()
    await readAndPublish()
    await store.getState().disconnectDart()
    expect(store.getState().dartScopeMetaCache).toEqual({})
    expect(store.getState().dartMountedScopeKey).toBeNull()
  })

  it('drops the host scope entries when the viewer changes on the same host', async () => {
    const host = runtime.host(null)
    seed(host, 3)
    seed(runtime.host(REMOTE), 2)
    connectViewer()
    await readAndPublish()
    store.setState({
      settings: { ...store.getState().settings!, activeRuntimeEnvironmentId: REMOTE },
      dartStatusContextKey: getDartReadScope({ activeRuntimeEnvironmentId: REMOTE }).contextKey
    })
    await readAndPublish()
    const remoteKey = mountedEntry().key
    store.setState({
      settings: { ...store.getState().settings!, activeRuntimeEnvironmentId: null }
    })
    connectViewer()
    host.connection = { connected: true, viewer: { id: 'user-b', name: 'Blair Example' } }

    await store.getState().checkDartConnection()

    const state = store.getState()
    expect(state.dartStatus.viewer?.id).toBe('user-b')
    expect(state.dartMountedScopeKey).toBe(remoteKey)
    expect(Object.keys(state.dartListCache)).toEqual([remoteKey])
    expect(Object.keys(state.dartScopeMetaCache)).toEqual([remoteKey])
  })

  it('clears the mounted key and metadata when the only host changes viewer', async () => {
    const host = runtime.host(null)
    seed(host, 3)
    connectViewer()
    await readAndPublish()
    host.connection = { connected: true, viewer: { id: 'user-b', name: 'Blair Example' } }

    await store.getState().checkDartConnection()

    const state = store.getState()
    expect(state.dartMountedScopeKey).toBeNull()
    expect(state.dartScopeMetaCache).toEqual({})
    expect(state.dartListCache).toEqual({})
  })

  it('drops a host scope entries when its account changed while another host was shown', async () => {
    const host = runtime.host(null)
    seed(host, 3)
    seed(runtime.host(REMOTE), 2)
    await store.getState().checkDartConnection()
    await readAndPublish()
    store.setState({
      settings: { ...store.getState().settings!, activeRuntimeEnvironmentId: REMOTE }
    })
    await store.getState().checkDartConnection()
    await readAndPublish()
    const remoteKey = mountedEntry().key
    host.connection = { connected: true, viewer: { id: 'user-b', name: 'Blair Example' } }
    store.setState({
      settings: { ...store.getState().settings!, activeRuntimeEnvironmentId: null }
    })

    await store.getState().checkDartConnection()

    const state = store.getState()
    expect(state.dartStatus.viewer?.id).toBe('user-b')
    expect(Object.keys(state.dartListCache)).toEqual([remoteKey])
    expect(Object.keys(state.dartScopeMetaCache)).toEqual([remoteKey])
  })

  it('applies the same account check to a connection test', async () => {
    const host = runtime.host(null)
    seed(host, 3)
    await store.getState().checkDartConnection()
    await readAndPublish()
    host.connection = { connected: true, viewer: { id: 'user-b', name: 'Blair Example' } }

    await store.getState().testDartConnection()

    const state = store.getState()
    expect(state.dartStatus.viewer?.id).toBe('user-b')
    expect(state.dartListCache).toEqual({})
    expect(state.dartScopeMetaCache).toEqual({})
    expect(state.dartMountedScopeKey).toBeNull()
  })

  it('keeps both hosts entries and metadata across a host switch', async () => {
    seed(runtime.host(null), 3)
    seed(runtime.host(REMOTE), 2)
    connectViewer()
    await readAndPublish()
    store.setState({
      settings: { ...store.getState().settings!, activeRuntimeEnvironmentId: REMOTE },
      dartStatusContextKey: getDartReadScope({ activeRuntimeEnvironmentId: REMOTE }).contextKey
    })
    await readAndPublish()

    store.setState({
      settings: { ...store.getState().settings!, activeRuntimeEnvironmentId: null }
    })

    const state = store.getState()
    expect(Object.keys(state.dartScopeMetaCache)).toHaveLength(2)
    expect(Object.keys(state.dartListCache)).toHaveLength(2)
  })
})
