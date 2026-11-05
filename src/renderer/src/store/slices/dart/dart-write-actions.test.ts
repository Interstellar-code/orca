// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import { createTestStore } from '../store-test-helpers'
import { getDartReadScope } from './dart-read-coordination'
import { captureDartEpoch, dartTaskIdentity, isDartEpochCurrent } from './dart-task-identity'
import { dartTaskFixture, installFakeDartRuntime } from './dart-fake-runtime.test-support'

const TASK_ID = 'aB3dE5gH7jK9'
const REMOTE = 'write-actions-remote'
const viewer = { id: 'user-a', name: 'Alex Example' }

const remoteContext: TaskSourceContext = {
  kind: 'task-source',
  provider: 'dart',
  projectId: 'project-1',
  hostId: `runtime:${REMOTE}`,
  providerIdentity: { provider: 'dart', userId: viewer.id }
}

const UNAUTHORIZED = {
  ok: false,
  error: 'Dart rejected the API token.',
  errorCode: 'dart.unauthorized',
  outcome: 'notApplied'
} as const

let runtime: ReturnType<typeof installFakeDartRuntime>

beforeEach(() => {
  runtime = installFakeDartRuntime()
  runtime.host(null).addTask(dartTaskFixture(TASK_ID, { status: 'Local' }))
  runtime.host(REMOTE).addTask(dartTaskFixture(TASK_ID, { status: 'Remote' }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('dart write actions', () => {
  it('writes to the source context host, not the page host', async () => {
    const store = createTestStore()

    const result = await store
      .getState()
      .updateDartTask(TASK_ID, { status: 'Done' }, { sourceContext: remoteContext })

    expect(result).toMatchObject({ ok: true, task: { status: 'Done' } })
    expect(runtime.host(REMOTE).tasks.get(TASK_ID)?.status).toBe('Done')
    expect(runtime.host(null).tasks.get(TASK_ID)?.status).toBe('Local')
  })

  it('keeps writing to the host resolved at the start when the active host changes', async () => {
    const store = createTestStore()
    store.setState({
      settings: { ...store.getState().settings!, activeRuntimeEnvironmentId: REMOTE }
    })
    const release = runtime.host(REMOTE).hold('dart.updateTask')

    const pending = store.getState().updateDartTask(TASK_ID, { status: 'Done' })
    await vi.waitFor(() => expect(runtime.host(REMOTE).count('dart.updateTask')).toBe(1))
    store.setState({
      settings: { ...store.getState().settings!, activeRuntimeEnvironmentId: null }
    })
    release()
    await pending

    expect(runtime.host(REMOTE).tasks.get(TASK_ID)?.status).toBe('Done')
    expect(runtime.host(null).count('dart.updateTask')).toBe(0)
  })

  it('strips a description smuggled past the field-update type', async () => {
    const store = createTestStore()
    const updates = { status: 'Done', description: 'Overwrites Dart' }

    // @ts-expect-error a description never goes through updateDartTask
    await store.getState().updateDartTask(TASK_ID, updates)

    expect(runtime.host(null).requests.at(-1)?.params.updates).toEqual({ status: 'Done' })
  })

  it('sends a description only through the targeted patch', async () => {
    const store = createTestStore()

    const result = await store.getState().updateDartTaskDescription({
      taskId: TASK_ID,
      updates: [{ type: 'replace', oldText: 'old', newText: 'new' }]
    })

    expect(result).toMatchObject({ ok: true, task: { description: 'patched description' } })
    expect(runtime.host(null).count('dart.updateTask')).toBe(0)
  })

  it('returns a refused write with its message, code and outcome intact', async () => {
    const store = createTestStore()
    const refusal = {
      ok: false as const,
      error: 'Dart is rate limiting requests. Try again shortly.',
      errorCode: 'dart.rateLimited' as const,
      outcome: 'notApplied' as const
    }
    runtime.host(null).refusals.push(refusal)

    await expect(store.getState().updateDartTask(TASK_ID, { status: 'Done' })).resolves.toEqual(
      refusal
    )
    expect(runtime.host(null).count('dart.updateTask')).toBe(1)
  })

  it('reports a thrown transport error as unknown, not as a refusal', async () => {
    const store = createTestStore()
    runtime.host(null).transportError = new Error('socket closed')

    await expect(store.getState().updateDartTask(TASK_ID, { status: 'Done' })).resolves.toEqual({
      ok: false,
      error: 'socket closed',
      outcome: 'unknown'
    })
  })

  it('marks the connection lost on a 401 of the current host only', async () => {
    const store = createTestStore()
    store.setState({ dartStatus: { connected: true, viewer } })
    runtime.host(null).refusals.push(UNAUTHORIZED)
    await store.getState().updateDartTask(TASK_ID, { status: 'Done' })
    expect(store.getState().dartStatus.connected).toBe(false)

    const switched = createTestStore()
    switched.setState({
      dartStatus: { connected: true, viewer },
      settings: { ...switched.getState().settings!, activeRuntimeEnvironmentId: REMOTE }
    })
    const release = runtime.host(REMOTE).hold('dart.updateTask')
    runtime.host(REMOTE).refusals.push(UNAUTHORIZED)
    const pending = switched.getState().updateDartTask(TASK_ID, { status: 'Done' })
    await vi.waitFor(() => expect(runtime.host(REMOTE).count('dart.updateTask')).toBe(1))
    switched.setState({
      settings: { ...switched.getState().settings!, activeRuntimeEnvironmentId: null }
    })
    release()
    await pending
    expect(switched.getState().dartStatus.connected).toBe(true)
  })

  it('marks the page disconnected on a 401 of an explicit scope on the page host', async () => {
    const store = createTestStore()
    store.setState({
      dartStatus: { connected: true, viewer },
      settings: { ...store.getState().settings!, activeRuntimeEnvironmentId: REMOTE }
    })
    runtime.host(REMOTE).refusals.push(UNAUTHORIZED)

    await store
      .getState()
      .updateDartTask(TASK_ID, { status: 'Done' }, { sourceContext: remoteContext })

    expect(store.getState().dartStatus).toEqual({ connected: false, viewer: null })
  })

  it('keeps the page connected on a 401 of an explicit scope on another host', async () => {
    const store = createTestStore()
    store.setState({ dartStatus: { connected: true, viewer } })
    runtime.host(REMOTE).refusals.push(UNAUTHORIZED)

    await store
      .getState()
      .updateDartTask(TASK_ID, { status: 'Done' }, { sourceContext: remoteContext })

    expect(store.getState().dartStatus).toEqual({ connected: true, viewer })
  })

  it('keeps a connection made while a write was in flight when the write comes back 401', async () => {
    const store = createTestStore()
    store.setState({ dartStatus: { connected: true, viewer } })
    runtime.host(null).refusals.push(UNAUTHORIZED)
    const release = runtime.host(null).hold('dart.updateTask')

    const write = store.getState().updateDartTask(TASK_ID, { status: 'Done' })
    await vi.waitFor(() => expect(runtime.host(null).count('dart.updateTask')).toBe(1))
    const newViewer = { id: 'user-new', name: 'New Example' }
    runtime.host(null).connection = { connected: true, viewer: newViewer }
    await store.getState().connectDart({ apiToken: 'dsa_FAKE' })
    release()

    await expect(write).resolves.toMatchObject({ errorCode: 'dart.unauthorized' })
    expect(store.getState().dartStatus.connected).toBe(true)
    expect(store.getState().dartStatus.viewer).toMatchObject(newViewer)
  })

  it('applies a status check that a task write settled during, after a host switch', async () => {
    const store = createTestStore()
    store.setState({ dartStatus: { connected: true, viewer }, dartStatusChecked: true })
    const remoteViewer = { id: 'user-remote', name: 'Remote Example' }
    runtime.host(REMOTE).connection = { connected: true, viewer: remoteViewer }
    store.setState({
      settings: { ...store.getState().settings!, activeRuntimeEnvironmentId: REMOTE }
    })
    const release = runtime.host(REMOTE).hold('dart.status')

    const check = store.getState().checkDartConnection()
    await vi.waitFor(() => expect(runtime.host(REMOTE).count('dart.status')).toBe(1))
    await store.getState().createDartTask({ title: 'During the check' })
    release()
    await check

    expect(store.getState().dartStatus.viewer).toMatchObject(remoteViewer)
    expect(store.getState().dartStatusChecked).toBe(true)
    expect(store.getState().dartStatusContextKey).toBe(
      getDartReadScope(store.getState().settings).contextKey
    )
  })

  it('drops a comments read that started before the comment was added', async () => {
    const store = createTestStore()
    const scope = getDartReadScope(store.getState().settings)
    const identity = dartTaskIdentity(scope, TASK_ID, null)
    const readBeforeAdd = captureDartEpoch(identity)

    const result = await store.getState().addDartComment({ taskId: TASK_ID, text: 'Looks good' })

    expect(result).toMatchObject({ ok: true, comment: { text: 'Looks good', taskId: TASK_ID } })
    expect(isDartEpochCurrent(readBeforeAdd)).toBe(false)
  })

  it('still ends the read epoch when reading a comment reply throws', async () => {
    const store = createTestStore()
    const identity = dartTaskIdentity(getDartReadScope(store.getState().settings), TASK_ID, null)
    const release = runtime.host(null).hold('dart.addComment')
    runtime.host(null).garbledReplies.push({ ok: true })

    const add = store.getState().addDartComment({ taskId: TASK_ID, text: 'Looks good' })
    await vi.waitFor(() => expect(runtime.host(null).count('dart.addComment')).toBe(1))
    const readDuringAdd = captureDartEpoch(identity)
    release()

    await expect(add).resolves.toMatchObject({ ok: false, outcome: 'unknown' })
    expect(isDartEpochCurrent(readDuringAdd)).toBe(false)
  })

  it('still refetches lists when reading a create reply throws', async () => {
    const store = createTestStore()
    await store.getState().listDartTasks({})
    runtime.host(null).garbledReplies.push({ ok: true })

    await expect(store.getState().createDartTask({ title: 'Landed' })).resolves.toMatchObject({
      ok: false,
      outcome: 'unknown'
    })
    const page = await store.getState().listDartTasks({})

    expect(runtime.host(null).count('dart.listTasks')).toBe(2)
    expect(page).toMatchObject({ ok: true, totalCount: 2 })
  })

  it('makes the next list read refetch after a create', async () => {
    const store = createTestStore()
    await store.getState().listDartTasks({})
    expect(runtime.host(null).count('dart.listTasks')).toBe(1)

    await store.getState().createDartTask({ title: 'New' })
    const page = await store.getState().listDartTasks({})

    expect(runtime.host(null).count('dart.listTasks')).toBe(2)
    expect(page).toMatchObject({ ok: true, totalCount: 2 })
  })

  it('refetches lists after a create that may have landed, but not after a refused one', async () => {
    const store = createTestStore()
    await store.getState().listDartTasks({})

    runtime.host(null).refusals.push({
      ok: false,
      error: 'Dart rejected the request.',
      errorCode: 'dart.badRequest',
      outcome: 'notApplied'
    })
    await store.getState().createDartTask({ title: 'Refused' })
    await store.getState().listDartTasks({})
    expect(runtime.host(null).count('dart.listTasks')).toBe(1)

    runtime.host(null).lostReplies.push({
      ok: false,
      error: 'Failed to create Dart task.',
      errorCode: 'dart.createFailed',
      outcome: 'unknown'
    })
    await store.getState().createDartTask({ title: 'Landed' })
    const page = await store.getState().listDartTasks({})
    expect(runtime.host(null).count('dart.listTasks')).toBe(2)
    expect(page).toMatchObject({ ok: true, totalCount: 2 })
  })

  it('leaves the lists of another host alone after a create', async () => {
    const store = createTestStore()
    await store.getState().listDartTasks({})

    await store.getState().createDartTask({ title: 'Remote' }, { sourceContext: remoteContext })
    await store.getState().listDartTasks({})

    expect(runtime.host(null).count('dart.listTasks')).toBe(1)
  })
})
