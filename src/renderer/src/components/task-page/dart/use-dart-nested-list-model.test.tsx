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
  return renderHook(() =>
    useDartNestedListModel({
      tasks,
      nested: overrides.nested ?? true,
      pageScope: scope,
      hostKey: account.hostKey,
      accountKey: account.accountKey,
      viewerId: VIEWER.id,
      relationshipsHost: true
    })
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
})
