// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import { relationshipsFixture } from '@/store/slices/dart/dart-fake-relationships.test-support'
import {
  dartTaskFixture,
  installFakeDartRuntime
} from '@/store/slices/dart/dart-fake-runtime.test-support'
import { getDartReadScope } from '@/store/slices/dart/dart-read-coordination'
import { dartTaskIdentity } from '@/store/slices/dart/dart-task-identity'
import { createTestStore } from '@/store/slices/store-test-helpers'
import { dartTaskWriteState, enqueueDartTaskWrite } from './dart-task-write-queue'

const BLOCKER_ID = 'blocker00001'
const viewer = { id: 'user-a', name: 'Alex Example' }
const LOST_REPLY = {
  ok: false,
  error: 'Failed to update Dart task.',
  errorCode: 'dart.updateFailed',
  outcome: 'unknown'
} as const

let runtime: ReturnType<typeof installFakeDartRuntime>
let nextTask = 0

beforeEach(() => {
  runtime = installFakeDartRuntime()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// The queue's state is module-level, so each test gets its own host and task.
async function openDetail() {
  nextTask += 1
  const ENV = `blocker-queue-host-${nextTask}`
  const TASK_ID = `taskBlockr${String(nextTask).padStart(2, '0')}`
  const host = runtime.host(ENV)
  host.relationships = true
  host.addTask(
    dartTaskFixture(TASK_ID, {
      status: 'To-do',
      relationships: relationshipsFixture({ relatedIds: ['related00001'] })
    })
  )
  const store = createTestStore()
  const settings = { ...store.getState().settings!, activeRuntimeEnvironmentId: ENV }
  const pageScope = getDartReadScope(settings)
  store.setState({
    settings,
    dartStatus: { connected: true, viewer },
    dartStatusChecked: true,
    dartStatusContextKey: pageScope.contextKey
  })
  const sourceContext: TaskSourceContext = {
    kind: 'task-source',
    provider: 'dart',
    projectId: 'project-1',
    hostId: `runtime:${ENV}`,
    providerIdentity: { provider: 'dart', userId: viewer.id }
  }
  const identity = dartTaskIdentity(getDartReadScope(settings, sourceContext), TASK_ID, viewer.id)
  const shown = await store.getState().fetchDartTask(TASK_ID, { sourceContext })
  if (!shown.ok) {
    throw new Error(shown.error)
  }
  const previous: DartTask = shown.task

  const refresh = () => store.getState().fetchDartTask(TASK_ID, { sourceContext, force: true })
  const base = {
    identity,
    refresh,
    patch: (patch: Partial<DartTask>) => store.getState().patchDartTask(identity, patch),
    invalidateLists: () => store.getState().invalidateDartLists(identity)
  }
  return {
    host,
    taskId: TASK_ID,
    state: () => dartTaskWriteState(identity),
    setBlockers: (blockerIds: string[]) =>
      enqueueDartTaskWrite({
        ...base,
        previous,
        optimistic: {
          relationships: { ...(previous.relationships ?? relationshipsFixture()), blockerIds }
        },
        write: () => store.getState().setDartTaskBlockers(TASK_ID, blockerIds, { sourceContext })
      }),
    setStatus: (status: string) =>
      enqueueDartTaskWrite({
        ...base,
        previous,
        optimistic: { status },
        write: () => store.getState().updateDartTask(TASK_ID, { status }, { sourceContext })
      })
  }
}

describe('blocker writes through the write queue', () => {
  it('marks relationships pending while the write is in flight, and no other field', async () => {
    const page = await openDetail()
    const release = page.host.hold('dart.updateTaskBlockers')

    const write = page.setBlockers([BLOCKER_ID])

    expect([...page.state().pendingFields]).toEqual(['relationships'])
    release()
    await expect(write).resolves.toMatchObject({
      ok: true,
      task: { relationships: { blockerIds: [BLOCKER_ID], relatedIds: ['related00001'] } }
    })
    expect(page.state().pendingFields.size).toBe(0)
    expect(page.host.dartCalls).toEqual([`GET /tasks/${page.taskId}`, `PUT /tasks/${page.taskId}`])
  })

  it('logs a PUT only for a write that reached Dart, not for a failed pre-read', async () => {
    const page = await openDetail()
    page.host.failReads = true

    await expect(page.setBlockers([BLOCKER_ID])).resolves.toMatchObject({ ok: false })

    expect(page.host.dartCalls).toEqual([`GET /tasks/${page.taskId}`])
  })

  it('keeps a status write independent of a blocker write that came back unknown', async () => {
    const page = await openDetail()
    page.host.lostReplies.push(LOST_REPLY)

    await expect(page.setBlockers([BLOCKER_ID])).resolves.toMatchObject({ outcome: 'unknown' })

    expect([...page.state().blockedFields]).toEqual(['relationships'])
    await expect(page.setStatus('Doing')).resolves.toMatchObject({
      ok: true,
      task: { status: 'Doing' }
    })
    await expect(page.setBlockers([])).resolves.toMatchObject({
      ok: false,
      outcome: 'notApplied'
    })
    expect(page.host.count('dart.updateTaskBlockers')).toBe(1)
  })

  it('sends a status write queued behind a blocker write only after it, on the same task', async () => {
    const page = await openDetail()
    const release = page.host.hold('dart.updateTaskBlockers')

    const blockers = page.setBlockers([BLOCKER_ID])
    const status = page.setStatus('Doing')

    expect([...page.state().pendingFields].sort()).toEqual(['relationships', 'status'])
    release()
    await Promise.all([blockers, status])
    const writes = page.host.requests
      .map((request) => request.method)
      .filter((method) => method === 'dart.updateTaskBlockers' || method === 'dart.updateTask')
    expect(writes).toEqual(['dart.updateTaskBlockers', 'dart.updateTask'])
  })
})
