// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { useAppStore } from '@/store'
import {
  dartTaskFixture,
  installFakeDartRuntime
} from '@/store/slices/dart/dart-fake-runtime.test-support'
import { getDartReadScope } from '@/store/slices/dart/dart-read-coordination'
import { useTaskPageDartState, type TaskPageDartStateInput } from './use-task-page-dart-state'

type PageInput = Omit<TaskPageDartStateInput, 'providerRuntimeContextKey'>

describe('useTaskPageDartState subtasks and blockers', () => {
  let runtime: ReturnType<typeof installFakeDartRuntime>
  let nextEnv = 0
  const realWindow = window
  const viewer = { id: 'user-a', name: 'Alex Example' }

  beforeEach(() => {
    localStorage.clear()
    runtime = installFakeDartRuntime()
    const api = window.api
    vi.stubGlobal('window', realWindow)
    Object.assign(realWindow, { api })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  function openBoardPage(args: { relationships?: boolean; extraTasks?: readonly DartTask[] } = {}) {
    nextEnv += 1
    const env = `relationships-host-${nextEnv}`
    const host = runtime.host(env)
    host.board = true
    host.relationships = args.relationships === true
    host.addTask(dartTaskFixture(`open${nextEnv}aaaaaaa`, { title: 'Open one', status: 'To-do' }))
    host.addTask(dartTaskFixture(`open${nextEnv}bbbbbbb`, { title: 'Open two', status: 'Doing' }))
    for (const extra of args.extraTasks ?? []) {
      host.addTask(extra)
    }
    const settings = { ...useAppStore.getState().settings!, activeRuntimeEnvironmentId: env }
    useAppStore.setState({
      settings,
      dartStatus: { connected: true, viewer },
      dartStatusChecked: true,
      dartStatusContextKey: getDartReadScope(settings).contextKey,
      dartListCache: {},
      dartScopeMetaCache: {},
      dartRelationshipCache: {}
    })
    const state = useAppStore.getState()
    const input: PageInput = {
      taskSource: 'dart',
      dartConnected: true,
      dartStatus: { connected: true, viewer },
      dartTaskSourceContext: null,
      linearAttachmentWorkspaces: [],
      listDartTasks: state.listDartTasks,
      fetchDartTask: state.fetchDartTask,
      fetchDartConfig: state.fetchDartConfig
    }
    const hook = renderHook(() =>
      useTaskPageDartState({
        ...input,
        providerRuntimeContextKey: useAppStore((s) => getProviderRuntimeContextKey(s.settings))
      })
    )
    const listRequests = () => host.requests.filter(({ method }) => method === 'dart.listTasks')
    return { host, hook, listRequests }
  }

  const parent = dartTaskFixture('parent000001', { title: 'Parent task', status: 'Doing' })
  const child = dartTaskFixture('child0000001', {
    title: 'Child task',
    status: 'To-do',
    parentId: parent.id,
    tags: ['backend']
  })
  const orphan = dartTaskFixture('orphan000001', {
    title: 'Orphan subtask',
    parentId: 'notloaded001'
  })
  const onHold = (index: number): DartTask =>
    dartTaskFixture(`hold${String(index).padStart(8, '0')}`, {
      title: `On hold ${index}`,
      status: 'On hold',
      relationships: {
        subtaskIds: [],
        blockerIds: [],
        blockingIds: [],
        duplicateIds: [],
        relatedIds: []
      }
    })
  const getTaskRequests = (host: { requests: { method: string }[] }) =>
    host.requests.filter(({ method }) => method === 'dart.getTask')

  it('keeps a subtask with a loaded parent out of the top-level rows', async () => {
    const { hook } = openBoardPage({ relationships: true, extraTasks: [parent, child] })
    await waitFor(() => expect(hook.result.current.dartTasks).toHaveLength(4))

    const nested = hook.result.current.dartNestedList
    expect(nested.nested).toBe(true)
    expect(nested.rows.map((row) => row.task.id)).not.toContain(child.id)
    expect(nested.rows.map((row) => row.task.id)).toContain(parent.id)
  })

  it('renders flat for a search, a client filter, the toggle off, and a host without relationships', async () => {
    const { hook } = openBoardPage({ relationships: true, extraTasks: [parent, child] })
    await waitFor(() => expect(hook.result.current.dartTasks).toHaveLength(4))

    act(() => hook.result.current.setDartFilter('tag', 'backend'))
    expect(hook.result.current.dartNestedList.nested).toBe(false)
    act(() => hook.result.current.setDartFilter('tag', null))
    expect(hook.result.current.dartNestedList.nested).toBe(true)

    act(() => hook.result.current.setDartFilter('blockedOnHold', true))
    expect(hook.result.current.dartNestedList.nested).toBe(false)
    act(() => hook.result.current.setDartFilter('blockedOnHold', false))

    act(() => hook.result.current.setDartNestSubtasks(false))
    expect(hook.result.current.dartNestedList.nested).toBe(false)
    expect(hook.result.current.dartNestedList.rows.map((row) => row.task.id)).toContain(child.id)
    act(() => hook.result.current.setDartNestSubtasks(true))

    act(() => hook.result.current.applyDartSearch('Child'))
    await waitFor(() => expect(hook.result.current.dartTasks.map((t) => t.id)).toContain(child.id))
    expect(hook.result.current.dartNestedList.nested).toBe(false)
  })

  it('renders exactly as release A on a host without relationships', async () => {
    const { hook, host } = openBoardPage({ extraTasks: [parent, child] })
    await waitFor(() => expect(hook.result.current.dartTasks).toHaveLength(4))

    expect(hook.result.current.dartRelationshipsHost).toBe(false)
    expect(hook.result.current.dartNestedList.nested).toBe(false)
    expect(hook.result.current.dartNestedList.hiddenSubtasks).toBe(0)
    expect(hook.result.current.dartBoardModel.checkMore).toBeUndefined()
    expect(getTaskRequests(host)).toHaveLength(0)
  })

  it('counts subtasks whose parent is not loaded', async () => {
    const { hook } = openBoardPage({ relationships: true, extraTasks: [orphan] })
    await waitFor(() => expect(hook.result.current.dartTasks).toHaveLength(3))

    expect(hook.result.current.dartNestedList.hiddenSubtasks).toBe(1)
    expect(hook.result.current.dartNestedList.rows.map((row) => row.task.id)).not.toContain(
      orphan.id
    )
  })

  it('sends no request when the blocked chip changes', async () => {
    const { hook, listRequests } = openBoardPage({ relationships: true })
    await waitFor(() => expect(hook.result.current.dartTasks).toHaveLength(2))
    const before = listRequests().length

    act(() => hook.result.current.setDartFilter('blockedOnHold', true))

    expect(listRequests()).toHaveLength(before)
  })

  it('reads the first 20 on-hold tasks after each publish and checks the next batch on request', async () => {
    const held = Array.from({ length: 25 }, (_, index) => onHold(index))
    const { hook, host } = openBoardPage({ relationships: true, extraTasks: held })
    await waitFor(() => expect(getTaskRequests(host)).toHaveLength(20))
    await waitFor(() => expect(hook.result.current.dartBoardModel.notChecked).toBe(5))

    act(() => hook.result.current.dartBoardModel.checkMore?.())
    await waitFor(() => expect(getTaskRequests(host)).toHaveLength(25))
    await waitFor(() => expect(hook.result.current.dartBoardModel.notChecked).toBe(0))

    act(() => hook.result.current.setDartRefreshNonce((n) => n + 1))
    await waitFor(() => expect(getTaskRequests(host)).toHaveLength(45))
  })
})
