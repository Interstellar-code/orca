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
const REMOTE = 'scope-read-remote'
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

function listRequests(host: FakeDartHost) {
  return host.requests.filter((request) => request.method === 'dart.listTasks')
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

beforeEach(() => {
  runtime = installFakeDartRuntime()
  store = createTestStore()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('scoped viewer during a host or status switch', () => {
  const OTHER_VIEWER = { id: 'user-b', name: 'Blair Example' }

  function showOtherHostStatus(): void {
    store.setState({
      dartStatus: { connected: true, viewer: OTHER_VIEWER },
      dartStatusChecked: true,
      dartStatusContextKey: getDartReadScope({ activeRuntimeEnvironmentId: REMOTE }).contextKey
    })
  }

  it('sends no other host viewer id for a mine read of a scope whose status is not shown', async () => {
    const host = runtime.host(null)
    seed(host, 3)
    showOtherHostStatus()

    const result = await store
      .getState()
      .readDartScope({ ...FILTERS, mine: true }, { features: FEATURES, scope: defaultScope() })

    expect(listRequests(host)).toHaveLength(0)
    expect(result.openTotal).toBe(0)
  })

  it('sends no other host viewer id when more finished tasks are read after a status switch', async () => {
    const host = runtime.host(null)
    seed(host, 3, 120)
    connectViewer()
    await readAndPublish({ ...FILTERS, mine: true })
    const before = listRequests(host).length
    showOtherHostStatus()

    await store
      .getState()
      .readMoreDone({ ...FILTERS, mine: true }, { features: FEATURES, scope: defaultScope() })

    const sent = listRequests(host).slice(before)
    expect(sent.some((request) => request.params.assigneeId === OTHER_VIEWER.id)).toBe(false)
  })
})
