// @vitest-environment happy-dom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import { useAppStore } from '@/store'
import {
  dartTaskFixture,
  installFakeDartRuntime,
  type FakeDartHost
} from '@/store/slices/dart/dart-fake-runtime.test-support'
import { getDartReadScope } from '@/store/slices/dart/dart-read-coordination'
import { dartAccountIdentity } from '@/store/slices/dart/dart-task-identity'
import { useDartNestedListModel } from './use-dart-nested-list-model'

const VIEWER = { id: 'user-a', name: 'Alex Example' }
const PARENT = dartTaskFixture('parent000001', { title: 'Parent', status: 'To-do' })
const CHILD = dartTaskFixture('child0000001', {
  title: 'Child',
  status: 'To-do',
  parentId: PARENT.id
})
const realWindow = window

let runtime: ReturnType<typeof installFakeDartRuntime>
let host: FakeDartHost

function listRequests(): number {
  return host.count('dart.listTasks')
}

function mountModel(tasks: readonly DartTask[], overrides: { nested?: boolean } = {}) {
  const scope = getDartReadScope(useAppStore.getState().settings)
  const account = dartAccountIdentity(scope, VIEWER.id)
  return renderHook(
    (props: { tasks: readonly DartTask[] }) =>
      useDartNestedListModel({
        tasks: props.tasks,
        nested: overrides.nested ?? true,
        pageScope: scope,
        hostKey: account.hostKey,
        accountKey: account.accountKey,
        viewerId: VIEWER.id,
        relationshipsHost: true
      }),
    { initialProps: { tasks } }
  )
}

beforeEach(() => {
  runtime = installFakeDartRuntime()
  // The fake stubs a bare `window`, which React DOM cannot render into, so its API moves onto the real one.
  const api = window.api
  vi.stubGlobal('window', realWindow)
  Object.assign(realWindow, { api })
  host = runtime.host(null)
  host.relationships = true
  host.tasks.clear()
  host.addTask(PARENT)
  host.addTask(CHILD)
  const scope = getDartReadScope(useAppStore.getState().settings)
  useAppStore.setState({
    dartListCache: {},
    dartRelationshipCache: {},
    dartStatus: { connected: true, viewer: VIEWER },
    dartStatusChecked: true,
    dartStatusContextKey: scope.contextKey
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useDartNestedListModel', () => {
  it('reads children once on expand and shows one only the children entry holds', async () => {
    const tasks = [PARENT]
    const hook = mountModel(tasks)
    expect(hook.result.current.rows.map((row) => row.task.id)).toEqual([PARENT.id])

    await act(async () => hook.result.current.toggle(PARENT.id))
    expect(listRequests()).toBe(1)
    expect(hook.result.current.children(PARENT.id).state).toBe('ready')
    expect(hook.result.current.rows).toEqual([
      expect.objectContaining({ depth: 0 }),
      { task: CHILD, depth: 1, parentId: PARENT.id }
    ])

    await act(async () => hook.result.current.toggle(PARENT.id))
    expect(hook.result.current.rows.map((row) => row.task.id)).toEqual([PARENT.id])
    await act(async () => hook.result.current.toggle(PARENT.id))
    expect(listRequests()).toBe(1)
    expect(hook.result.current.children(PARENT.id).data).toEqual({
      tasks: [CHILD],
      total: 1,
      complete: true
    })
  })

  it('refetches on re-expansion after the entry is invalidated or stale, not while fresh', async () => {
    vi.useFakeTimers()
    const hook = mountModel([PARENT])
    const scope = getDartReadScope(useAppStore.getState().settings)
    const toggleTwice = async () => {
      await act(async () => hook.result.current.toggle(PARENT.id))
      await act(async () => hook.result.current.toggle(PARENT.id))
    }

    await toggleTwice()
    expect(listRequests()).toBe(1)
    await toggleTwice()
    expect(listRequests()).toBe(1)

    act(() => useAppStore.getState().invalidateDartLists(dartAccountIdentity(scope, VIEWER.id)))
    await toggleTwice()
    expect(listRequests()).toBe(2)

    await act(() => vi.advanceTimersByTimeAsync(10 * 60 * 1000))
    await toggleTwice()
    expect(listRequests()).toBe(3)
  })

  it('stays idle before 200 ms and loading after', async () => {
    vi.useFakeTimers()
    const release = host.hold('dart.listTasks')
    const hook = mountModel([PARENT])

    act(() => hook.result.current.toggle(PARENT.id))
    await act(() => vi.advanceTimersByTimeAsync(199))
    expect(hook.result.current.children(PARENT.id).state).toBe('idle')

    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(hook.result.current.children(PARENT.id).state).toBe('loading')

    release()
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(hook.result.current.children(PARENT.id).state).toBe('ready')
  })

  it('exposes a failed read and recovers on retry', async () => {
    host.failReads = true
    const hook = mountModel([PARENT])

    await act(async () => hook.result.current.toggle(PARENT.id))
    const failed = hook.result.current.children(PARENT.id)
    expect(failed.state).toBe('error')
    expect(failed.error).toEqual(expect.any(String))
    const reads = listRequests()

    host.failReads = false
    await act(async () => hook.result.current.children(PARENT.id).retry())
    expect(listRequests()).toBe(reads + 1)
    expect(hook.result.current.children(PARENT.id).state).toBe('ready')
    expect(hook.result.current.children(PARENT.id).data?.tasks).toEqual([CHILD])
  })

  it('renders flat rows and reads nothing when nested is off', async () => {
    const tasks = [PARENT, CHILD]
    const hook = mountModel(tasks, { nested: false })

    expect(hook.result.current.nested).toBe(false)
    expect(hook.result.current.rows.map((row) => row.task)).toEqual(tasks)
    expect(hook.result.current.hiddenSubtasks).toBe(0)
    await act(async () => hook.result.current.toggle(PARENT.id))
    expect(listRequests()).toBe(0)
    expect(hook.result.current.canExpand(PARENT)).toBe(false)
  })

  it('expands a parent with a known empty subtaskIds when a loaded row names it as parent', () => {
    const empty = {
      subtaskIds: [],
      blockerIds: [],
      blockingIds: [],
      duplicateIds: [],
      relatedIds: []
    }
    const withLoadedChild = { ...PARENT, relationships: empty }
    const lonely = dartTaskFixture('lonely000001', { relationships: empty })
    const hook = mountModel([withLoadedChild, lonely, CHILD])

    expect(hook.result.current.canExpand(withLoadedChild)).toBe(true)
    expect(hook.result.current.canExpand(lonely)).toBe(false)
  })

  it('moves a cached child to its newer parent in children, rows and card counts', async () => {
    const other = dartTaskFixture('other0000001', { title: 'Other', status: 'To-do' })
    const hook = mountModel([PARENT, other])
    await act(async () => hook.result.current.toggle(PARENT.id))
    await act(async () => hook.result.current.toggle(other.id))
    expect(hook.result.current.children(PARENT.id).data?.tasks).toEqual([CHILD])

    const moved = { ...CHILD, parentId: other.id, updatedAt: '2026-01-01T00:00:00.000Z' }
    hook.rerender({ tasks: [PARENT, other, moved] })

    expect(hook.result.current.children(PARENT.id).data).toEqual({
      tasks: [],
      total: 0,
      complete: true
    })
    expect(hook.result.current.children(other.id).data?.tasks).toEqual([moved])
    expect(hook.result.current.rows).toEqual([
      expect.objectContaining({ task: PARENT, depth: 0 }),
      expect.objectContaining({ task: other, depth: 0 }),
      { task: moved, depth: 1, parentId: other.id }
    ])
    expect(hook.result.current.cardInfo(PARENT.id).subtasks?.loaded).toBe(0)
    expect(hook.result.current.cardInfo(other.id).subtasks?.loaded).toBe(1)
  })
})
