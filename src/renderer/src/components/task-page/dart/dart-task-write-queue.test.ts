// @vitest-environment happy-dom

import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import {
  dartTaskFixture,
  installFakeDartRuntime
} from '@/store/slices/dart/dart-fake-runtime.test-support'
import { bumpProviderRuntimeSessionGeneration } from '@/lib/provider-runtime-context'
import { getDartReadScope } from '@/store/slices/dart/dart-read-coordination'
import {
  dartAccountIdentity,
  dartTaskIdentity,
  captureDartEpoch,
  isDartEpochCurrent
} from '@/store/slices/dart/dart-task-identity'
import { createTestStore } from '@/store/slices/store-test-helpers'
import {
  dartTaskWriteState,
  dismissDartTaskNotice,
  enqueueDartTaskWrite,
  pendingDartPatches,
  recheckDartTaskNotice,
  subscribeDartTaskWrites,
  withPendingDartPatches
} from './dart-task-write-queue'

const viewer = { id: 'user-a', name: 'Alex Example' }
const LOST_REPLY = {
  ok: false,
  error: 'Failed to update Dart task.',
  errorCode: 'dart.updateFailed',
  outcome: 'unknown'
} as const
const REFUSED = {
  ok: false,
  error: 'Dart rejected the request.',
  errorCode: 'dart.badRequest',
  outcome: 'notApplied'
} as const

let runtime: ReturnType<typeof installFakeDartRuntime>
let nextHost = 0

function sourceContext(env: string, userId: string | null): TaskSourceContext {
  return {
    kind: 'task-source',
    provider: 'dart',
    projectId: 'project-1',
    hostId: `runtime:${env}`,
    providerIdentity: userId ? { provider: 'dart', userId } : null
  }
}

/** The normal flow: a page listing in the default scope, a detail open in its own explicit scope, one fresh host per test. */
async function openPage() {
  nextHost += 1
  const env = `queue-host-${nextHost}`
  const taskId = `taskQueue${String(nextHost).padStart(3, '0')}`
  const host = runtime.host(env)
  host.addTask(dartTaskFixture(taskId, { description: 'Original description' }))
  const store = createTestStore()
  const settings = { ...store.getState().settings!, activeRuntimeEnvironmentId: env }
  const pageScope = getDartReadScope(settings)
  store.setState({
    settings,
    dartStatus: { connected: true, viewer },
    dartStatusChecked: true,
    dartStatusContextKey: pageScope.contextKey
  })
  const detailContext = sourceContext(env, viewer.id)
  const detailScope = getDartReadScope(settings, detailContext)
  await store.getState().listDartTasks({})
  await store.getState().fetchDartTask(taskId, { sourceContext: detailContext })

  const identity = dartTaskIdentity(detailScope, taskId, viewer.id)
  const detailShown: { task: DartTask; updates: string[] } = {
    task: dartTaskFixture(taskId, { description: 'Original description' }),
    updates: []
  }
  const unsubscribe = subscribeDartTaskWrites(
    identity,
    (update) => {
      detailShown.task = { ...detailShown.task, ...update.patch }
      detailShown.updates.push(update.kind)
    },
    (patch) => {
      detailShown.task = { ...detailShown.task, ...patch }
    }
  )

  const edit = (updates: Pick<DartTask, 'status'> | Pick<DartTask, 'priority'>) =>
    enqueueDartTaskWrite({
      identity,
      previous: detailShown.task,
      optimistic: updates,
      write: () =>
        store.getState().updateDartTask(taskId, updates, { sourceContext: detailContext }),
      refresh: () =>
        store.getState().fetchDartTask(taskId, { sourceContext: detailContext, force: true }),
      patch: (patch) => store.getState().patchDartTask(identity, patch),
      invalidateLists: () => store.getState().invalidateDartLists(identity)
    })

  const listEntry = () => store.getState().dartListCache[`${pageScope.contextKey}::list::{}`]
  const detailEntry = () =>
    store.getState().dartTaskCache[`${detailScope.cachePrefix}::task::${taskId}`]
  return {
    env,
    host,
    store,
    taskId,
    identity,
    pageScope,
    detailContext,
    detailShown,
    edit,
    listEntry,
    listRow: () => listEntry()?.data?.tasks.find((task) => task.id === taskId),
    detailEntry,
    state: () => dartTaskWriteState(identity),
    unsubscribe
  }
}

beforeEach(() => {
  runtime = installFakeDartRuntime()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('dart task write queue: the list and detail pair', () => {
  it('shows an edit made in the detail on the differently keyed list row, before the reply', async () => {
    const page = await openPage()
    const release = page.host.hold('dart.updateTask')

    const write = page.edit({ status: 'Doing' })

    expect(page.detailShown.task.status).toBe('Doing')
    expect(page.listRow()?.status).toBe('Doing')
    expect(page.detailEntry()?.data?.status).toBe('Doing')
    expect(page.state().pendingFields.has('status')).toBe(true)

    release()
    await expect(write).resolves.toMatchObject({ ok: true, task: { status: 'Doing' } })
    expect(page.host.tasks.get(page.taskId)?.status).toBe('Doing')
    expect(page.detailShown.task.status).toBe('Doing')
    expect(page.listRow()?.status).toBe('Doing')
    expect(page.state().pendingFields.size).toBe(0)
  })

  it('makes the next list read refetch after a successful write', async () => {
    const page = await openPage()
    const listReads = page.host.count('dart.listTasks')

    await page.edit({ status: 'Doing' })
    expect(page.listEntry()?.fetchedAt).toBe(0)
    await page.store.getState().listDartTasks({})

    expect(page.host.count('dart.listTasks')).toBe(listReads + 1)
    expect(page.listRow()?.status).toBe('Doing')
  })

  it('refetches a filtered list that the edited task was not on', async () => {
    const page = await openPage()
    const filter = { status: 'Doing' }
    await expect(page.store.getState().listDartTasks(filter)).resolves.toMatchObject({
      totalCount: 0
    })

    await page.edit({ status: 'Doing' })

    await expect(page.store.getState().listDartTasks(filter)).resolves.toMatchObject({
      totalCount: 1
    })
  })

  it('leaves another host and another account with the same task id untouched', async () => {
    const page = await openPage()
    const otherHostEnv = `${page.env}-other`
    const shared = dartTaskFixture(page.taskId)
    runtime.host(otherHostEnv).addTask(shared)
    const otherHost = sourceContext(otherHostEnv, viewer.id)
    const otherAccount = sourceContext(page.env, 'user-b')
    const unknownAccount = sourceContext(page.env, null)
    const store = page.store.getState()
    await store.fetchDartTask(page.taskId, { sourceContext: otherHost })
    await store.listDartTasks({}, { sourceContext: otherHost })
    await store.fetchDartTask(page.taskId, { sourceContext: otherAccount })
    await store.listDartTasks({}, { sourceContext: otherAccount })
    await store.fetchDartTask(page.taskId, { sourceContext: unknownAccount })
    await store.listDartTasks({}, { sourceContext: unknownAccount })

    await page.edit({ status: 'Doing' })

    const { dartTaskCache, dartListCache } = page.store.getState()
    for (const context of [otherHost, otherAccount, unknownAccount]) {
      const prefix = getDartReadScope(null, context).cachePrefix
      expect(dartTaskCache[`${prefix}::task::${page.taskId}`]?.data?.status).toBe('To-do')
      expect(dartTaskCache[`${prefix}::task::${page.taskId}`]?.fetchedAt).toBeGreaterThan(0)
      expect(dartListCache[`${prefix}::list::{}`]?.data?.tasks[0].status).toBe('To-do')
      expect(dartListCache[`${prefix}::list::{}`]?.fetchedAt).toBeGreaterThan(0)
    }
    expect(runtime.host(otherHostEnv).tasks.get(page.taskId)?.status).toBe('To-do')
  })
})

describe('dart task write queue: refused writes', () => {
  it('rolls list and detail back and returns the provider message, code and outcome', async () => {
    const page = await openPage()
    page.host.refusals.push(REFUSED)

    const result = await page.edit({ status: 'Doing' })

    expect(result).toEqual(REFUSED)
    expect(page.detailShown.task.status).toBe('To-do')
    expect(page.listRow()?.status).toBe('To-do')
    expect(page.detailEntry()?.data?.status).toBe('To-do')
    expect(page.state().notice).toEqual({
      kind: 'refused',
      field: 'status',
      message: REFUSED.error
    })
    expect(page.state().pendingFields.size).toBe(0)
  })

  it('keeps a refused notice after later edits until the user dismisses it', async () => {
    const page = await openPage()
    page.host.refusals.push(REFUSED)
    await page.edit({ status: 'Doing' })

    await page.edit({ priority: 'High' })
    expect(page.state().notice?.kind).toBe('refused')

    dismissDartTaskNotice(page.identity)
    expect(page.state().notice).toBeNull()
  })

  it('rolls back on a rate limit with a toast and no notice, and sends once', async () => {
    const toastError = vi.spyOn(toast, 'error').mockReturnValue('toast-id')
    const page = await openPage()
    const failure = {
      ok: false,
      error: 'Dart is rate limiting requests. Try again shortly.',
      errorCode: 'dart.rateLimited',
      outcome: 'unknown'
    } as const
    page.host.refusals.push(failure)

    const result = await page.edit({ status: 'Doing' })

    expect(result).toEqual(failure)
    expect(page.detailShown.task.status).toBe('To-do')
    expect(page.listRow()?.status).toBe('To-do')
    expect(page.host.count('dart.updateTask')).toBe(1)
    expect(page.host.tasks.get(page.taskId)?.status).toBe('To-do')
    expect(toastError).toHaveBeenCalledTimes(1)
    expect(toastError.mock.calls[0]?.[0]).toContain('rate limiting')
    expect(page.state().notice).toBeNull()
    expect(page.state().pendingFields.size).toBe(0)
    toastError.mockRestore()
  })

  it('rolls back on an unauthorized reply, whatever its outcome, with a notice', async () => {
    const page = await openPage()
    const failure = {
      ok: false,
      error: 'Dart rejected the API token.',
      errorCode: 'dart.unauthorized',
      outcome: 'unknown'
    } as const
    page.host.refusals.push(failure)

    const result = await page.edit({ status: 'Doing' })

    expect(result).toEqual(failure)
    expect(page.detailShown.task.status).toBe('To-do')
    expect(page.host.count('dart.updateTask')).toBe(1)
    expect(page.state().notice).toMatchObject({ kind: 'refused', field: 'status' })
    expect(page.state().pendingFields.size).toBe(0)
  })
})

describe('dart task write queue: ordering', () => {
  it('runs writes one at a time and keeps two quick edits of different fields', async () => {
    const page = await openPage()
    const release = page.host.hold('dart.updateTask')

    const first = page.edit({ status: 'Doing' })
    const second = page.edit({ priority: 'High' })
    await vi.waitFor(() => expect(page.host.count('dart.updateTask')).toBe(1))
    expect(page.detailShown.task).toMatchObject({ status: 'Doing', priority: 'High' })
    expect(page.host.count('dart.updateTask')).toBe(1)

    release()
    await Promise.all([first, second])

    expect(page.host.tasks.get(page.taskId)).toMatchObject({ status: 'Doing', priority: 'High' })
    expect(page.detailShown.task).toMatchObject({ status: 'Doing', priority: 'High' })
    expect(page.listRow()).toMatchObject({ status: 'Doing', priority: 'High' })
  })

  it('does not undo the second edit when the first is refused', async () => {
    const page = await openPage()
    page.host.refusals.push(REFUSED)

    const [first, second] = await Promise.all([
      page.edit({ status: 'Doing' }),
      page.edit({ priority: 'High' })
    ])

    expect(first.ok).toBe(false)
    expect(second.ok).toBe(true)
    expect(page.detailShown.task).toMatchObject({ status: 'To-do', priority: 'High' })
    expect(page.listRow()).toMatchObject({ status: 'To-do', priority: 'High' })
  })

  it('does not clobber a queued edit with the refresh of an earlier one', async () => {
    const page = await openPage()
    const releaseRefresh = page.host.hold('dart.getTask')

    const first = page.edit({ status: 'Doing' })
    const second = page.edit({ priority: 'High' })
    await vi.waitFor(() => expect(page.host.count('dart.getTask')).toBeGreaterThan(1))
    releaseRefresh()
    await first

    expect(page.detailShown.task).toMatchObject({ status: 'Doing', priority: 'High' })
    await second
    expect(page.detailShown.task).toMatchObject({ status: 'Doing', priority: 'High' })
  })

  it('keeps the newer value when an earlier edit of the same field is refused', async () => {
    const page = await openPage()
    page.host.refusals.push(REFUSED)

    await Promise.all([page.edit({ status: 'Doing' }), page.edit({ status: 'Done' })])

    expect(page.detailShown.task.status).toBe('Done')
    expect(page.listRow()?.status).toBe('Done')
  })

  it('rolls back to the last saved value, not the value when the edit started', async () => {
    const page = await openPage()
    await page.edit({ status: 'Doing' })
    page.host.refusals.push(REFUSED)

    await page.edit({ status: 'Done' })

    expect(page.detailShown.task.status).toBe('Doing')
  })

  it('does not undo a saved write when the refresh fails', async () => {
    const page = await openPage()
    page.host.failReads = true

    const result = await page.edit({ status: 'Doing' })

    expect(result.ok).toBe(true)
    expect(page.detailShown.task.status).toBe('Doing')
    expect(page.listRow()?.status).toBe('Doing')
    expect(page.state().notice).toBeNull()
  })

  it('shows what the refresh read, including a remote change to another field', async () => {
    const page = await openPage()
    page.host.addTask({ ...page.host.tasks.get(page.taskId)!, assignee: 'Remote Person' })

    await page.edit({ status: 'Doing' })

    expect(page.detailShown.task).toMatchObject({ status: 'Doing', assignee: 'Remote Person' })
    expect(page.listRow()).toMatchObject({ status: 'Doing', assignee: 'Remote Person' })
  })

  it('lets a late subscriber and a late read see a still pending edit', async () => {
    const page = await openPage()
    const release = page.host.hold('dart.updateTask')
    const write = page.edit({ status: 'Doing' })

    const replayed: Partial<DartTask>[] = []
    const unsubscribe = subscribeDartTaskWrites(
      page.identity,
      () => {},
      (patch) => replayed.push(patch)
    )
    const remoteRow = dartTaskFixture(page.taskId, { assignee: 'Remote Person' })
    const account = dartAccountIdentity(page.pageScope, viewer.id)
    const otherAccount = dartAccountIdentity(page.pageScope, 'user-b')

    expect(replayed).toEqual([{ status: 'Doing' }])
    expect(withPendingDartPatches([remoteRow], account)[0]).toMatchObject({
      status: 'Doing',
      assignee: 'Remote Person'
    })
    expect(withPendingDartPatches([remoteRow], otherAccount)[0].status).toBe('To-do')

    release()
    await write
    unsubscribe()
    expect(withPendingDartPatches([remoteRow], account)[0].status).toBe('To-do')
  })
})

describe('dart task write queue: a failing screen', () => {
  it('keeps the queue moving and the other screens updated when a listener throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const page = await openPage()
    const unsubscribeBroken = subscribeDartTaskWrites(
      page.identity,
      () => {
        throw new Error('render failed')
      },
      () => {}
    )
    // Listeners run in order, so one added after the broken one proves the loop went on.
    const seenAfterBroken: Partial<DartTask>[] = []
    const unsubscribeLater = subscribeDartTaskWrites(
      page.identity,
      (update) => seenAfterBroken.push(update.patch),
      () => {}
    )

    const [first, second] = await Promise.all([
      page.edit({ status: 'Doing' }),
      page.edit({ priority: 'High' })
    ])

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    expect(page.host.tasks.get(page.taskId)).toMatchObject({ status: 'Doing', priority: 'High' })
    expect(page.listRow()).toMatchObject({ status: 'Doing', priority: 'High' })
    expect(page.state().pendingFields.size).toBe(0)
    expect(seenAfterBroken).toContainEqual({ status: 'Doing' })
    expect(consoleError).toHaveBeenCalledWith('Dart task write callback failed:', 'Error')
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('render failed')
    unsubscribeBroken()
    unsubscribeLater()
    consoleError.mockRestore()
  })
})

describe('dart task write queue: stale reads', () => {
  it('keeps an older in-flight read from overwriting the caches', async () => {
    const page = await openPage()
    const releaseList = page.host.hold('dart.listTasks')
    const oldList = page.store.getState().listDartTasks({}, { force: true })
    await vi.waitFor(() => expect(page.host.count('dart.listTasks')).toBe(2))

    await page.edit({ status: 'Doing' })
    releaseList()
    await oldList

    expect(page.listRow()?.status).toBe('Doing')
  })

  it('keeps a read that resolves during the write from caching over the optimistic value', async () => {
    const page = await openPage()
    const releaseList = page.host.hold('dart.listTasks')
    const oldList = page.store.getState().listDartTasks({}, { force: true })
    await vi.waitFor(() => expect(page.host.count('dart.listTasks')).toBe(2))
    const releaseWrite = page.host.hold('dart.updateTask')
    const write = page.edit({ status: 'Doing' })
    await vi.waitFor(() => expect(page.host.count('dart.updateTask')).toBe(1))

    releaseList()
    await oldList

    expect(page.listRow()?.status).toBe('Doing')
    releaseWrite()
    await write
  })

  it('keeps a read that starts during the write from caching the old value', async () => {
    const page = await openPage()
    const releaseWrite = page.host.hold('dart.updateTask')
    const releaseList = page.host.hold('dart.listTasks')
    const write = page.edit({ status: 'Doing' })
    await vi.waitFor(() => expect(page.host.count('dart.updateTask')).toBe(1))
    const midWriteList = page.store.getState().listDartTasks({}, { force: true })
    await vi.waitFor(() => expect(page.host.count('dart.listTasks')).toBe(2))

    releaseWrite()
    await write
    releaseList()
    await midWriteList

    expect(page.listRow()?.status).toBe('Doing')
  })

  it('changes the read epoch when a write starts and again when it settles', async () => {
    const page = await openPage()
    const beforeWrite = captureDartEpoch(page.identity)
    const release = page.host.hold('dart.updateTask')
    const write = page.edit({ status: 'Doing' })
    await vi.waitFor(() => expect(page.host.count('dart.updateTask')).toBe(1))
    expect(isDartEpochCurrent(beforeWrite)).toBe(false)

    const duringWrite = captureDartEpoch(page.identity)
    release()
    await write
    expect(isDartEpochCurrent(duringWrite)).toBe(false)
  })
})

describe('dart task write queue: settled epochs', () => {
  it.each([
    ['saved', null],
    ['refused', REFUSED]
  ] as const)('changes the epoch after a %s write has settled', async (_name, failure) => {
    const page = await openPage()
    if (failure) {
      page.host.refusals.push(failure)
    }
    const release = page.host.hold('dart.getTask')
    const releaseWrite = page.host.hold('dart.updateTask')
    const write = page.edit({ status: 'Doing' })
    await vi.waitFor(() => expect(page.host.count('dart.updateTask')).toBe(1))
    const duringWrite = captureDartEpoch(page.identity)
    releaseWrite()
    release()
    await write

    expect(isDartEpochCurrent(duringWrite)).toBe(false)
  })

  it('changes the epoch after the refresh of a saved write has been published', async () => {
    const page = await openPage()
    const release = page.host.hold('dart.getTask')
    const write = page.edit({ status: 'Doing' })
    await vi.waitFor(() => expect(page.host.count('dart.getTask')).toBe(2))
    const duringRefresh = captureDartEpoch(page.identity)
    release()
    await write

    expect(isDartEpochCurrent(duringRefresh)).toBe(false)
  })
})

describe('dart task write queue: unknown outcome', () => {
  it('rolls a queued write of that field back to what the re-read showed', async () => {
    const page = await openPage()
    page.host.addTask({ ...page.host.tasks.get(page.taskId)!, status: 'Remote status' })
    page.host.refusals.push(LOST_REPLY)

    await Promise.all([page.edit({ status: 'Doing' }), page.edit({ status: 'Done' })])

    expect(page.detailShown.task.status).toBe('Remote status')
  })

  it('does not roll back: shows what Dart had with its time, and keeps notice and marker', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-04T10:00:00Z'), toFake: ['Date'] })
    const page = await openPage()
    page.host.lostReplies.push(LOST_REPLY)
    const getTaskBefore = page.host.count('dart.getTask')

    const result = await page.edit({ status: 'Doing' })

    expect(result).toEqual(LOST_REPLY)
    expect(page.host.count('dart.getTask')).toBe(getTaskBefore + 1)
    expect(page.detailShown.task.status).toBe('Doing')
    expect(page.state().blockedFields.has('status')).toBe(true)
    expect(page.state().notice).toEqual({
      kind: 'unknown',
      field: 'status',
      message: 'Dart may have applied this change. Showing what Dart had when Orca last checked.',
      checkedAt: new Date('2026-11-04T10:00:00Z').getTime()
    })
  })

  it("shows Dart's older value as evidence when the write has not landed, marker still on", async () => {
    const page = await openPage()
    page.host.refusals.push(LOST_REPLY)

    await page.edit({ status: 'Doing' })

    expect(page.detailShown.task.status).toBe('To-do')
    expect(page.listRow()?.status).toBe('To-do')
    expect(page.state().notice?.kind).toBe('unknown')
    expect(page.state().blockedFields.has('status')).toBe(true)
  })

  it('reports the field as blocked, not as in flight', async () => {
    const page = await openPage()
    page.host.lostReplies.push(LOST_REPLY)
    const release = page.host.hold('dart.updateTask')

    const write = page.edit({ status: 'Doing' })
    expect(page.state().pendingFields.has('status')).toBe(true)
    expect(page.state().blockedFields.size).toBe(0)

    release()
    await write
    expect(page.state().pendingFields.size).toBe(0)
    expect(page.state().blockedFields.has('status')).toBe(true)
  })

  it('sends nothing more to that field, and still sends other fields', async () => {
    const page = await openPage()
    page.host.lostReplies.push(LOST_REPLY)
    await page.edit({ status: 'Doing' })
    const writes = page.host.count('dart.updateTask')
    const shownChanges = page.detailShown.updates.length

    const blocked = await page.edit({ status: 'Done' })
    expect(blocked).toMatchObject({ ok: false, outcome: 'notApplied' })
    expect(page.host.count('dart.updateTask')).toBe(writes)
    expect(page.detailShown.task.status).toBe('Doing')
    expect(page.detailShown.updates.length).toBe(shownChanges)

    const other = await page.edit({ priority: 'High' })
    expect(other.ok).toBe(true)
    expect(page.host.count('dart.updateTask')).toBe(writes + 1)
    expect(page.state().notice?.kind).toBe('unknown')
    expect(page.state().blockedFields.has('status')).toBe(true)
  })

  it('does not send a queued edit of that field once the earlier one comes back unknown', async () => {
    const page = await openPage()
    page.host.refusals.push(LOST_REPLY)

    const [first, queued] = await Promise.all([
      page.edit({ status: 'Doing' }),
      page.edit({ status: 'Done' })
    ])

    expect(first).toEqual(LOST_REPLY)
    expect(queued).toMatchObject({ ok: false, outcome: 'notApplied' })
    expect(page.host.count('dart.updateTask')).toBe(1)
    expect(page.detailShown.task.status).toBe('To-do')
    expect(page.state().blockedFields.has('status')).toBe(true)
  })

  it('reads again on recheck, showing the delayed write, and never clears by itself', async () => {
    const page = await openPage()
    page.host.refusals.push(LOST_REPLY)
    await page.edit({ status: 'Doing' })
    expect(page.detailShown.task.status).toBe('To-do')
    const reads = page.host.count('dart.getTask')
    const firstCheck = page.state().notice?.checkedAt

    page.host.addTask({ ...page.host.tasks.get(page.taskId)!, status: 'Doing' })
    await recheckDartTaskNotice(page.identity)

    expect(page.host.count('dart.getTask')).toBe(reads + 1)
    expect(page.detailShown.task.status).toBe('Doing')
    expect(page.listRow()?.status).toBe('Doing')
    expect(page.state().notice?.kind).toBe('unknown')
    expect(page.state().notice?.checkedAt).toBeGreaterThanOrEqual(firstCheck ?? 0)
    expect(page.state().blockedFields.has('status')).toBe(true)
  })

  it('changes nothing when the re-read fails, including under a later read', async () => {
    const page = await openPage()
    page.host.lostReplies.push(LOST_REPLY)
    page.host.failReads = true

    const result = await page.edit({ status: 'Doing' })

    expect(result).toEqual(LOST_REPLY)
    expect(page.detailShown.task.status).toBe('Doing')
    expect(page.listRow()?.status).toBe('Doing')
    expect(page.state().notice).toMatchObject({ kind: 'unknown', field: 'status' })
    expect(page.state().notice?.checkedAt).toBeUndefined()
    expect(pendingDartPatches(page.identity)).toEqual({ status: 'Doing' })

    await recheckDartTaskNotice(page.identity)
    expect(page.detailShown.task.status).toBe('Doing')
    expect(page.state().notice?.checkedAt).toBeUndefined()
    expect(page.state().blockedFields.has('status')).toBe(true)
  })

  it('stops overlaying the optimistic value once a read has shown what Dart holds', async () => {
    const page = await openPage()
    page.host.refusals.push(LOST_REPLY)
    await page.edit({ status: 'Doing' })

    expect(pendingDartPatches(page.identity)).toEqual({})
  })

  it('drops a recheck that a later write overtook', async () => {
    const page = await openPage()
    page.host.refusals.push(LOST_REPLY)
    await page.edit({ status: 'Doing' })
    const release = page.host.hold('dart.getTask')
    const recheck = recheckDartTaskNotice(page.identity)
    await vi.waitFor(() => expect(page.host.count('dart.getTask')).toBeGreaterThan(1))
    const updates = page.detailShown.updates.length

    await page.edit({ priority: 'High' })
    const afterWrite = page.detailShown.updates.length
    release()
    await recheck

    expect(afterWrite).toBeGreaterThan(updates)
    expect(page.detailShown.updates.length).toBe(afterWrite)
  })

  it('keeps the notice and the field block after switching host and back', async () => {
    const page = await openPage()
    page.host.lostReplies.push(LOST_REPLY)
    await page.edit({ status: 'Doing' })
    const writes = page.host.count('dart.updateTask')

    bumpProviderRuntimeSessionGeneration()
    bumpProviderRuntimeSessionGeneration()
    const settings = page.store.getState().settings
    const reopened = dartTaskIdentity(
      getDartReadScope(settings, page.detailContext),
      page.taskId,
      viewer.id
    )

    expect(dartTaskWriteState(reopened).notice?.kind).toBe('unknown')
    expect(dartTaskWriteState(reopened).blockedFields.has('status')).toBe(true)
    await expect(page.edit({ status: 'Done' })).resolves.toMatchObject({ ok: false })
    expect(page.host.count('dart.updateTask')).toBe(writes)
  })

  it('returns to the last confirmed value when a never-read unknown notice is dismissed', async () => {
    const page = await openPage()
    page.host.refusals.push(LOST_REPLY)
    page.host.failReads = true
    await page.edit({ status: 'Doing' })
    expect(page.detailShown.task.status).toBe('Doing')
    page.host.failReads = false

    dismissDartTaskNotice(page.identity)

    expect(page.detailShown.task.status).toBe('To-do')
    expect(page.listRow()?.status).toBe('To-do')
    expect(page.state().blockedFields.size).toBe(0)
    expect(pendingDartPatches(page.identity)).toEqual({})

    page.host.refusals.push(REFUSED)
    await page.edit({ status: 'Done' })
    expect(page.detailShown.task.status).toBe('To-do')
  })

  it('leaves the value alone when an unknown notice with a read behind it is dismissed', async () => {
    const page = await openPage()
    page.host.lostReplies.push(LOST_REPLY)
    await page.edit({ status: 'Doing' })

    dismissDartTaskNotice(page.identity)

    expect(page.detailShown.task.status).toBe('Doing')
    expect(page.listRow()?.status).toBe('Doing')
  })

  it('shows the newest refusal over an unknown notice, whose block stays', async () => {
    const page = await openPage()
    page.host.lostReplies.push(LOST_REPLY)
    await page.edit({ status: 'Doing' })
    page.host.refusals.push(REFUSED)
    await page.edit({ priority: 'High' })

    expect(page.state().notice).toMatchObject({ kind: 'refused', field: 'priority' })
    expect(page.state().blockedFields.has('status')).toBe(true)
    const writes = page.host.count('dart.updateTask')
    await expect(page.edit({ status: 'Done' })).resolves.toMatchObject({ ok: false })
    expect(page.host.count('dart.updateTask')).toBe(writes)

    dismissDartTaskNotice(page.identity)
    expect(page.state().notice).toMatchObject({ kind: 'unknown', field: 'status' })
    expect(page.state().blockedFields.has('status')).toBe(true)
  })

  it('lifts the block only when the user dismisses the notice', async () => {
    const page = await openPage()
    page.host.lostReplies.push(LOST_REPLY)
    await page.edit({ status: 'Doing' })
    await recheckDartTaskNotice(page.identity)
    expect(page.state().notice?.kind).toBe('unknown')

    dismissDartTaskNotice(page.identity)

    expect(page.state().notice).toBeNull()
    expect(page.state().blockedFields.size).toBe(0)
    await expect(page.edit({ status: 'Done' })).resolves.toMatchObject({ ok: true })
    expect(page.host.tasks.get(page.taskId)?.status).toBe('Done')
  })

  it('treats a thrown write as unknown, without rejecting', async () => {
    const page = await openPage()

    const result = await enqueueDartTaskWrite({
      identity: page.identity,
      previous: page.detailShown.task,
      optimistic: { status: 'Doing' },
      write: async () => {
        throw new Error('socket closed')
      },
      refresh: () =>
        page.store.getState().fetchDartTask(page.taskId, {
          sourceContext: page.detailContext,
          force: true
        }),
      patch: (patch) => page.store.getState().patchDartTask(page.identity, patch),
      invalidateLists: () => page.store.getState().invalidateDartLists(page.identity)
    })

    expect(result).toEqual({ ok: false, outcome: 'unknown', error: 'socket closed' })
    expect(page.state().notice?.kind).toBe('unknown')
  })

  it('reports a description patch as pending until it settles, with nothing shown early', async () => {
    const page = await openPage()
    const release = page.host.hold('dart.updateTaskDescription')

    const save = enqueueDartTaskWrite({
      identity: page.identity,
      previous: page.detailShown.task,
      optimistic: {},
      fields: ['description'],
      write: () =>
        page.store.getState().updateDartTaskDescription(
          {
            taskId: page.taskId,
            updates: [{ type: 'replace', oldText: 'Original', newText: 'New' }]
          },
          { sourceContext: page.detailContext }
        ),
      refresh: () =>
        page.store.getState().fetchDartTask(page.taskId, {
          sourceContext: page.detailContext,
          force: true
        }),
      patch: (patch) => page.store.getState().patchDartTask(page.identity, patch),
      invalidateLists: () => page.store.getState().invalidateDartLists(page.identity)
    })

    expect(page.state().pendingFields.has('description')).toBe(true)
    expect(page.detailShown.task.description).toBe('Original description')

    release()
    await save
    expect(page.state().pendingFields.has('description')).toBe(false)
    expect(page.detailShown.task.description).toBe('patched description')
  })

  it('blocks a description write through the fields it names', async () => {
    const page = await openPage()
    page.host.lostReplies.push(LOST_REPLY)
    const saveDescription = () =>
      enqueueDartTaskWrite({
        identity: page.identity,
        previous: page.detailShown.task,
        optimistic: {},
        fields: ['description'],
        write: () =>
          page.store.getState().updateDartTaskDescription(
            {
              taskId: page.taskId,
              updates: [{ type: 'replace', oldText: 'Original', newText: 'New' }]
            },
            { sourceContext: page.detailContext }
          ),
        refresh: () =>
          page.store.getState().fetchDartTask(page.taskId, {
            sourceContext: page.detailContext,
            force: true
          }),
        patch: (patch) => page.store.getState().patchDartTask(page.identity, patch),
        invalidateLists: () => page.store.getState().invalidateDartLists(page.identity)
      })

    await saveDescription()
    expect(page.state().blockedFields.has('description')).toBe(true)
    expect(page.detailShown.task.description).toBe('patched description')

    await expect(saveDescription()).resolves.toMatchObject({ ok: false, outcome: 'notApplied' })
    expect(page.host.count('dart.updateTaskDescription')).toBe(1)
  })
})
