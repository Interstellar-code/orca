// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { DartServerFilters } from '@/components/task-page/dart/dart-board-contracts'
import { createTestStore } from '../store-test-helpers'
import {
  dartTaskFixture,
  installFakeDartRuntime,
  type FakeDartHost
} from './dart-fake-runtime.test-support'
import { getDartReadScope } from './dart-read-coordination'

const FILTERS: DartServerFilters = { mine: false, dartboard: null, search: '' }
const FEATURES = { board: true }
const VIEWER = { id: 'user-a', name: 'Alex Example' }
const T0 = Date.UTC(2026, 0, 1)

let runtime: ReturnType<typeof installFakeDartRuntime>
let store: ReturnType<typeof createTestStore>

function openTask(index: number): DartTask {
  return dartTaskFixture(`open-${String(index).padStart(4, '0')}`, {
    title: `Open ${index}`,
    updatedAt: new Date(T0).toISOString(),
    completedAt: null,
    assignee: VIEWER.name
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

function defaultScope() {
  return getDartReadScope(store.getState().settings)
}

function connectViewer(): void {
  store.setState({
    dartStatus: { connected: true, viewer: VIEWER },
    dartStatusChecked: true,
    dartStatusContextKey: defaultScope().contextKey
  })
}

async function readAndPublish(filters: DartServerFilters = FILTERS) {
  const result = await store
    .getState()
    .readDartScope(filters, { features: FEATURES, scope: defaultScope() })
  store.getState().publishDartScope(filters, { result, current: true, scope: defaultScope() })
}

function mountedEntry() {
  const state = store.getState()
  const key = state.dartMountedScopeKey
  return {
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

describe('readMoreDone incompleteness', () => {
  async function loaded(done: number) {
    seed(runtime.host(null), 3, done)
    connectViewer()
    await readAndPublish()
  }

  async function readMore() {
    await store.getState().readMoreDone(FILTERS, { features: FEATURES, scope: defaultScope() })
  }

  it('stays complete when the next finished page is clean', async () => {
    await loaded(120)

    await readMore()

    expect(mountedEntry().meta).toMatchObject({ doneOffset: 100, incomplete: false })
  })

  it('marks the read set incomplete when a finished page repeats a task id', async () => {
    const host = runtime.host(null)
    await loaded(120)
    // A newer finish pushes the boundary row onto the next page as well.
    host.addTask(doneTask(500, { completedAt: new Date(T0 + 20_000 * 60_000).toISOString() }))

    await readMore()

    const ids = (mountedEntry().entry?.data?.tasks ?? []).map((task) => task.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(mountedEntry().meta).toMatchObject({ doneOffset: 100, incomplete: true })
  })

  it('marks the read set incomplete when a finished page is short before the total', async () => {
    const host = runtime.host(null)
    await loaded(120)
    host.maxRowsPerPage = 30

    await readMore()

    expect(mountedEntry().meta).toMatchObject({ doneOffset: 80, doneTotal: 120, incomplete: true })
  })

  it('stays complete when the last finished page is short at the total', async () => {
    await loaded(120)
    await readMore()

    await readMore()

    expect(mountedEntry().meta).toMatchObject({ doneOffset: 120, incomplete: false })
  })
})
