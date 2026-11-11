// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import { useAppStore } from '@/store'
import { relationshipsFixture } from '@/store/slices/dart/dart-fake-relationships.test-support'
import {
  dartTaskFixture,
  installFakeDartRuntime,
  type FakeDartHost
} from '@/store/slices/dart/dart-fake-runtime.test-support'
import { getDartReadScope } from '@/store/slices/dart/dart-read-coordination'
import { dartTaskIdentityKey } from '@/store/slices/dart/dart-task-identity'
import { useDartTaskRelationships } from './use-dart-task-relationships'

const VIEWER = { id: 'user-a', name: 'Alex Example' }
const realWindow = window
const LOST_REPLY = {
  ok: false,
  error: 'Failed to update Dart task.',
  errorCode: 'dart.updateFailed',
  outcome: 'unknown'
} as const

let runtime: ReturnType<typeof installFakeDartRuntime>
let host: FakeDartHost
let sequence = 0

// The write queue is module-level, so every test opens its own task ids.
function ids() {
  sequence += 1
  const tag = String(sequence).padStart(5, '0')
  // Dart ids are 12 characters.
  return {
    task: `relTask${tag}`,
    parent: `relPrnt${tag}`,
    blocker: `relBlck${tag}`,
    other: `relOthr${tag}`,
    subtask: `relSubt${tag}`
  }
}

function sourceContextFor(env: string): TaskSourceContext {
  return {
    kind: 'task-source',
    provider: 'dart',
    projectId: 'project-1',
    hostId: `runtime:${env}`,
    providerIdentity: { provider: 'dart', userId: VIEWER.id }
  }
}

function seedHost(
  target: FakeDartHost,
  task: string,
  overrides: Partial<DartTask> = {},
  related: readonly string[] = []
): DartTask {
  target.relationships = true
  const opened = dartTaskFixture(task, {
    title: `Title ${task}`,
    dartboard: 'Board 1',
    relationships: relationshipsFixture(),
    ...overrides
  })
  target.addTask(opened)
  for (const id of related) {
    target.addTask(dartTaskFixture(id, { title: `Title ${id}` }))
  }
  return opened
}

function mountHook(initial: DartTask | null, sourceContext: TaskSourceContext | null = null) {
  return renderHook(
    (props: { task: DartTask | null }) =>
      useDartTaskRelationships({ task: props.task, sourceContext, config: null }),
    { initialProps: { task: initial } }
  )
}

function cacheEntry(taskId: string, hostKey = 'local') {
  return useAppStore.getState().dartRelationshipCache[
    dartTaskIdentityKey({ hostKey, accountKey: VIEWER.id, taskId })
  ]
}

beforeEach(() => {
  runtime = installFakeDartRuntime()
  // The fake stubs a bare `window`, which React DOM cannot render into, so its API moves onto the real one.
  const api = window.api
  vi.stubGlobal('window', realWindow)
  Object.assign(realWindow, { api })
  host = runtime.host(null)
  host.tasks.clear()
  const settings = { ...useAppStore.getState().settings!, activeRuntimeEnvironmentId: null }
  useAppStore.setState({
    settings,
    dartListCache: {},
    dartRelationshipCache: {},
    dartScopeMetaCache: {},
    dartMountedScopeKey: null,
    dartStatus: { connected: true, viewer: VIEWER },
    dartStatusChecked: true,
    dartStatusContextKey: getDartReadScope(settings).contextKey
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('useDartTaskRelationships', () => {
  it('returns undefined with no task', async () => {
    host.relationships = true
    const hook = mountHook(null)
    await act(async () => {})
    expect(hook.result.current).toBeUndefined()
  })

  it('returns undefined on a host without relationships and reads nothing', async () => {
    const id = ids()
    const opened = seedHost(host, id.task)
    host.relationships = false
    const hook = mountHook(opened)
    await act(async () => {})
    expect(hook.result.current).toBeUndefined()
    expect(host.count('dart.getTask')).toBe(0)
  })

  it('is notChecked when the reply carries no relationships key', async () => {
    const id = ids()
    const opened = seedHost(host, id.task, { relationships: undefined })
    const hook = mountHook(opened)
    await waitFor(() => expect(hook.result.current?.state).toBe('notChecked'))
    expect(hook.result.current?.blockers.state).toBe('idle')
    expect(cacheEntry(id.task)).toMatchObject({ state: 'notChecked', relationships: null })
  })

  it('shows loading then known, stamps the cache with the current publication and loads titles', async () => {
    const id = ids()
    const opened = seedHost(
      host,
      id.task,
      {
        parentId: id.parent,
        relationships: relationshipsFixture({
          blockerIds: [id.blocker],
          subtaskIds: [id.subtask],
          blockingIds: [id.other]
        })
      },
      [id.parent, id.blocker, id.subtask, id.other]
    )
    useAppStore.setState({
      dartMountedScopeKey: 'mounted-scope',
      dartScopeMetaCache: {
        'mounted-scope': {
          openTotal: 1,
          doneTotal: 0,
          doneOffset: 0,
          generation: 1,
          fetchedAt: 1000,
          incomplete: false,
          partialReason: null,
          publicationId: 9
        }
      }
    })
    const release = host.hold('dart.getTask')
    const hook = mountHook(opened)
    expect(hook.result.current).toBeUndefined()
    await waitFor(() => expect(hook.result.current?.state).toBe('loading'))
    expect(hook.result.current?.blockers.state).toBe('idle')

    release()
    await waitFor(() => expect(hook.result.current?.subtasks.state).toBe('ready'))
    const api = hook.result.current!
    expect(api.state).toBe('known')
    expect(api.parent?.data?.title).toBe(`Title ${id.parent}`)
    expect(api.blockers.data?.map((blocker) => blocker.id)).toEqual([id.blocker])
    expect(api.blocking.data?.map((blocking) => blocking.id)).toEqual([id.other])
    expect(api.subtasks.data).toMatchObject({ total: 1, complete: true })
    expect(cacheEntry(id.task)).toMatchObject({ state: 'known', publicationId: 9 })
  })

  it('has no parent for a task without a parentId', async () => {
    const id = ids()
    const hook = mountHook(seedHost(host, id.task))
    await waitFor(() => expect(hook.result.current?.state).toBe('known'))
    expect(hook.result.current?.parent).toBeNull()
  })

  it('adds and removes a blocker with one write each, the full list, shown at once', async () => {
    const id = ids()
    const opened = seedHost(host, id.task, {}, [id.blocker, id.other])
    const hook = mountHook(opened)
    await waitFor(() => expect(hook.result.current?.state).toBe('known'))

    const release = host.hold('dart.updateTaskBlockers')
    let write: Promise<unknown> = Promise.resolve()
    act(() => {
      write = hook.result.current!.onSetBlockers([id.blocker, id.other])
    })
    await waitFor(() => expect(hook.result.current?.pending).toBe(true))
    expect(hook.result.current?.task.relationships?.blockerIds).toEqual([id.blocker, id.other])
    expect(cacheEntry(id.task)?.relationships?.blockerIds).toEqual([id.blocker, id.other])
    await act(async () => {
      release()
      await write
    })
    expect(host.requestsOf('dart.updateTaskBlockers')).toEqual([
      { taskId: id.task, blockerIds: [id.blocker, id.other] }
    ])
    expect(hook.result.current?.pending).toBe(false)

    await act(async () => {
      await hook.result.current!.onSetBlockers([id.other])
    })
    expect(host.requestsOf('dart.updateTaskBlockers').at(-1)).toEqual({
      taskId: id.task,
      blockerIds: [id.other]
    })
    expect(host.count('dart.updateTaskBlockers')).toBe(2)
    expect(hook.result.current?.task.relationships?.blockerIds).toEqual([id.other])
    expect(cacheEntry(id.task)?.relationships?.blockerIds).toEqual([id.other])
  })

  it('rolls a refused write back, in the cache too, and shows the refusal', async () => {
    const id = ids()
    const hook = mountHook(seedHost(host, id.task, {}, [id.blocker]))
    await waitFor(() => expect(hook.result.current?.state).toBe('known'))
    host.refusals.push({
      ok: false,
      error: 'Could not update blockers.',
      errorCode: 'dart.updateFailed',
      outcome: 'notApplied'
    })

    await act(async () => {
      await hook.result.current!.onSetBlockers([id.blocker])
    })

    expect(hook.result.current?.task.relationships?.blockerIds).toEqual([])
    expect(cacheEntry(id.task)?.relationships?.blockerIds).toEqual([])
    expect(hook.result.current?.notice.notice).toMatchObject({
      kind: 'refused',
      field: 'relationships',
      message: 'Failed to update Dart task.'
    })
  })

  it('keeps an unknown outcome on screen, blocks the field and shows the notice', async () => {
    const id = ids()
    const hook = mountHook(seedHost(host, id.task, {}, [id.blocker]))
    await waitFor(() => expect(hook.result.current?.state).toBe('known'))
    host.lostReplies.push(LOST_REPLY)

    await act(async () => {
      await hook.result.current!.onSetBlockers([id.blocker])
    })

    expect(hook.result.current?.notice.notice).toMatchObject({
      kind: 'unknown',
      field: 'relationships'
    })
    expect(hook.result.current?.blocked).toBe(true)
    expect(hook.result.current?.task.relationships?.blockerIds).toEqual([id.blocker])
    act(() => hook.result.current?.notice.dismissNotice())
    await waitFor(() => expect(hook.result.current?.blocked).toBe(false))
  })

  it('updates the cache from the queue after the detail has closed', async () => {
    const id = ids()
    const hook = mountHook(seedHost(host, id.task, {}, [id.blocker]))
    await waitFor(() => expect(hook.result.current?.state).toBe('known'))
    const release = host.hold('dart.updateTaskBlockers')
    let write: Promise<unknown> = Promise.resolve()
    act(() => {
      write = hook.result.current!.onSetBlockers([id.blocker])
    })
    hook.unmount()
    release()
    await write

    expect(cacheEntry(id.task)).toMatchObject({
      state: 'known',
      relationships: { blockerIds: [id.blocker] }
    })
  })

  it('searches every dartboard by default and the task dartboard with the toggle', async () => {
    const id = ids()
    const hook = mountHook(seedHost(host, id.task, { dartboard: 'Board 7' }))
    await waitFor(() => expect(hook.result.current?.state).toBe('known'))

    await act(async () => {
      await hook.result.current!.searchTasks('alpha')
    })
    await act(async () => {
      await hook.result.current!.searchTasks('beta', { thisDartboardOnly: true })
    })

    const searches = host.requestsOf('dart.listTasks').filter((params) => params.title)
    expect(searches[0]).toMatchObject({ title: 'alpha', isCompleted: false })
    expect(searches[0]).not.toHaveProperty('dartboard')
    expect(searches[1]).toMatchObject({ title: 'beta', dartboard: 'Board 7' })
  })

  it('drops the reply for a task that is no longer open', async () => {
    const first = ids()
    const second = ids()
    const firstTask = seedHost(host, first.task, {
      relationships: relationshipsFixture({ blockerIds: [first.blocker] })
    })
    const secondTask = seedHost(host, second.task, {
      relationships: relationshipsFixture({ blockerIds: [second.blocker] })
    })
    const release = host.hold('dart.getTask')
    const hook = mountHook(firstTask)
    await waitFor(() => expect(host.count('dart.getTask')).toBe(1))

    hook.rerender({ task: secondTask })
    await waitFor(() => expect(hook.result.current?.state).toBe('known'))
    await act(async () => {
      release()
    })

    expect(hook.result.current?.task.id).toBe(second.task)
    expect(hook.result.current?.task.relationships?.blockerIds).toEqual([second.blocker])
    expect(cacheEntry(first.task)).toBeUndefined()
  })

  it('searches and writes on the host the detail was opened from', async () => {
    const id = ids()
    const hostB = runtime.host('relationships-host-b')
    const opened = seedHost(hostB, id.task, {}, [id.blocker])
    host.relationships = true
    const hook = mountHook(opened, sourceContextFor('relationships-host-b'))
    await waitFor(() => expect(hook.result.current?.state).toBe('known'))

    await act(async () => {
      await hook.result.current!.searchTasks('gamma')
      await hook.result.current!.onSetBlockers([id.blocker])
    })

    expect(hostB.requestsOf('dart.listTasks').some((params) => params.title === 'gamma')).toBe(true)
    expect(hostB.count('dart.updateTaskBlockers')).toBe(1)
    expect(host.count('dart.listTasks')).toBe(0)
    expect(host.count('dart.updateTaskBlockers')).toBe(0)
    expect(host.count('dart.getTask')).toBe(0)
    expect(cacheEntry(id.task, 'runtime:relationships-host-b')).toMatchObject({ state: 'known' })
  })
})
