// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import { useAppStore } from '@/store'
import {
  dartTaskFixture,
  installFakeDartRuntime
} from '@/store/slices/dart/dart-fake-runtime.test-support'
import { getDartReadScope } from '@/store/slices/dart/dart-read-coordination'
import { useDartTaskDetailData } from './use-dart-task-detail-data'
import { useTaskPageDartState, type TaskPageDartStateInput } from './use-task-page-dart-state'

const viewer = { id: 'uSeR1d2e3f4g', name: 'Alex Example' }
const task: DartTask = {
  id: 'aB3dE5gH7jK9',
  title: 'Search results ignore archived projects',
  htmlUrl: 'https://app.dartai.com/t/aB3dE5gH7jK9',
  tags: []
}

function setup(overrides: Partial<TaskPageDartStateInput> = {}) {
  const listDartTasks = vi.fn(() =>
    Promise.resolve({ ok: true as const, tasks: [task], totalCount: 1 })
  )
  const input: TaskPageDartStateInput = {
    taskSource: 'dart',
    dartConnected: true,
    dartStatus: { connected: true, viewer },
    dartTaskSourceContext: null,
    linearAttachmentWorkspaces: [],
    listDartTasks,
    fetchDartTask: vi.fn(() => Promise.resolve({ ok: true as const, task })),
    fetchDartConfig: vi.fn(() =>
      Promise.resolve({
        ok: true as const,
        config: {
          dartboards: ['Example/Platform', 'Example/Platform/Search'],
          statuses: ['To-do'],
          types: [],
          tags: [],
          priorities: [],
          sizes: [],
          assignees: []
        }
      })
    ),
    ...overrides
  }
  const hook = renderHook(() => useTaskPageDartState({ ...input }))
  return { listDartTasks, hook }
}

describe('useTaskPageDartState', () => {
  it("lists the signed-in user's tasks by default", async () => {
    const { listDartTasks, hook } = setup()
    await waitFor(() => expect(hook.result.current.dartTasks).toHaveLength(1))
    expect(listDartTasks).toHaveBeenLastCalledWith(
      { limit: 100, assigneeId: viewer.id },
      { force: false }
    )
  })

  it('sends the full dartboard title, not its last segment', async () => {
    const { listDartTasks, hook } = setup()
    await waitFor(() => expect(hook.result.current.dartConfig?.dartboards).toHaveLength(2))

    act(() => hook.result.current.setDartFilter('dartboard', 'Example/Platform/Search'))

    await waitFor(() =>
      expect(listDartTasks).toHaveBeenLastCalledWith(
        expect.objectContaining({ dartboard: 'Example/Platform/Search' }),
        { force: false }
      )
    )
  })

  it('drops the assignee filter for All tasks and searches titles', async () => {
    const { listDartTasks, hook } = setup()
    await waitFor(() => expect(hook.result.current.dartTasks).toHaveLength(1))

    act(() => hook.result.current.setDartFilter('mine', false))
    act(() => hook.result.current.applyDartSearch('  archived '))

    await waitFor(() =>
      expect(listDartTasks).toHaveBeenLastCalledWith(
        { limit: 100, title: 'archived' },
        { force: false }
      )
    )
  })

  it('bypasses the cache when the user refreshes', async () => {
    const { listDartTasks, hook } = setup()
    await waitFor(() => expect(hook.result.current.dartTasks).toHaveLength(1))

    act(() => hook.result.current.setDartRefreshNonce((nonce) => nonce + 1))

    await waitFor(() =>
      expect(listDartTasks).toHaveBeenLastCalledWith(expect.anything(), { force: true })
    )
  })

  it('does not request anything while another provider is selected', () => {
    const { listDartTasks } = setup({ taskSource: 'github' })
    expect(listDartTasks).not.toHaveBeenCalled()
  })

  it('lists nothing instead of everyone when the viewer id is missing', async () => {
    const { listDartTasks, hook } = setup({
      dartStatus: { connected: true, viewer: null }
    })
    await waitFor(() => expect(hook.result.current.dartConfig).not.toBeNull())
    expect(listDartTasks).not.toHaveBeenCalled()
    expect(hook.result.current.dartTasks).toEqual([])
  })

  it('reports a failed load with its error code', async () => {
    const { hook } = setup({
      listDartTasks: vi.fn(() =>
        Promise.resolve({
          ok: false as const,
          error: 'Unauthorized',
          errorCode: 'dart.unauthorized' as const
        })
      )
    })
    await waitFor(() => expect(hook.result.current.dartError?.code).toBe('dart.unauthorized'))
    expect(hook.result.current.dartTasks).toEqual([])
  })
})

describe('useTaskPageDartState with the write queue', () => {
  let runtime: ReturnType<typeof installFakeDartRuntime>
  let nextHost = 0
  const realWindow = window
  const fakeViewer = { id: 'user-a', name: 'Alex Example' }

  beforeEach(() => {
    runtime = installFakeDartRuntime()
    // The fake stubs a bare `window`, which React DOM cannot render into, so its API moves onto the real one.
    const api = window.api
    vi.stubGlobal('window', realWindow)
    Object.assign(realWindow, { api })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  /** The normal pair on one fresh host: a default-scope list and an explicit-scope detail of its first row. */
  function openPage(detailEnv?: string) {
    nextHost += 1
    const env = `list-host-${nextHost}`
    const taskId = `taskListed${String(nextHost).padStart(3, '0')}`
    const host = runtime.host(env)
    host.addTask(dartTaskFixture(taskId, { description: 'Only the detail shows this' }))
    const settings = { ...useAppStore.getState().settings!, activeRuntimeEnvironmentId: env }
    useAppStore.setState({
      settings,
      dartStatus: { connected: true, viewer: fakeViewer },
      dartStatusChecked: true,
      dartStatusContextKey: getDartReadScope(settings).contextKey
    })
    const context: TaskSourceContext = {
      kind: 'task-source',
      provider: 'dart',
      projectId: 'project-1',
      hostId: `runtime:${detailEnv ?? env}`,
      providerIdentity: { provider: 'dart', userId: fakeViewer.id }
    }
    if (detailEnv) {
      runtime.host(detailEnv).addTask(dartTaskFixture(taskId))
    }
    const row = dartTaskFixture(taskId)
    const state = useAppStore.getState()
    const input: TaskPageDartStateInput = {
      taskSource: 'dart',
      dartConnected: true,
      dartStatus: { connected: true, viewer: fakeViewer },
      dartTaskSourceContext: context,
      linearAttachmentWorkspaces: [],
      listDartTasks: state.listDartTasks,
      fetchDartTask: state.fetchDartTask,
      fetchDartConfig: state.fetchDartConfig
    }
    const hook = renderHook(() => ({
      list: useTaskPageDartState({ ...input }),
      detail: useDartTaskDetailData(row, context)
    }))
    const edit = (status: string) => hook.result.current.detail.onUpdate({ status }, { status })
    const shownRow = () => hook.result.current.list.dartTasks.find((task) => task.id === taskId)
    const refresh = () => hook.result.current.list.setDartRefreshNonce((nonce) => nonce + 1)
    return { host, taskId, hook, edit, shownRow, refresh }
  }

  async function openListedPage(detailEnv?: string) {
    const page = openPage(detailEnv)
    await waitFor(() => expect(page.shownRow()).toBeTruthy())
    await waitFor(() => expect(page.hook.result.current.detail.full.status).toBe('ready'))
    return page
  }

  it('shows a detail edit on the row at once and never a description', async () => {
    const { host, hook, edit, shownRow } = await openListedPage()
    const release = host.hold('dart.updateTask')

    let write: Promise<unknown> = Promise.resolve()
    act(() => {
      write = edit('Done')
    })
    expect(shownRow()?.status).toBe('Done')

    await act(async () => {
      release()
      await write
    })

    expect(shownRow()?.status).toBe('Done')
    expect(shownRow()).not.toHaveProperty('description')
    expect(hook.result.current.detail.task?.description).toBe('Only the detail shows this')
  })

  it('rolls the row back when the write is refused', async () => {
    const { host, edit, shownRow } = await openListedPage()
    host.refusals.push({
      ok: false,
      error: 'No',
      errorCode: 'dart.badRequest',
      outcome: 'notApplied'
    })

    await act(async () => {
      await edit('Done')
    })

    expect(shownRow()?.status).toBe('To-do')
  })

  it('does not touch a same-id row of another host', async () => {
    const { hook, edit, shownRow } = await openListedPage('list-other-host')

    await act(async () => {
      await edit('Done')
    })

    expect(hook.result.current.detail.task?.status).toBe('Done')
    expect(shownRow()?.status).toBe('To-do')
  })

  it('keeps an edited row that stops matching the filter until the next refresh', async () => {
    const { hook, edit, shownRow, refresh, taskId } = await openListedPage()
    act(() => hook.result.current.list.setDartFilter('status', 'To-do'))
    await waitFor(() => expect(hook.result.current.list.dartLoading).toBe(false))

    await act(async () => {
      await edit('Done')
    })

    expect(shownRow()?.status).toBe('Done')

    act(refresh)

    await waitFor(() =>
      expect(hook.result.current.list.dartTasks.map((task) => task.id)).not.toContain(taskId)
    )
    expect(hook.result.current.list.dartTotalCount).toBe(0)
  })

  it('keeps the edit when a list read that started before it resolves after it', async () => {
    const { host, hook, edit, shownRow, refresh } = await openListedPage()
    act(() => hook.result.current.list.setDartFilter('status', 'To-do'))
    await waitFor(() => expect(hook.result.current.list.dartLoading).toBe(false))
    const releaseRead = host.hold('dart.listTasks')
    act(refresh)
    await waitFor(() => expect(host.count('dart.listTasks')).toBe(3))

    await act(async () => {
      await edit('Done')
    })
    await act(async () => {
      releaseRead()
    })

    // The re-read no longer returns the row, and the pin keeps it listed and counted.
    await waitFor(() => expect(host.count('dart.listTasks')).toBe(4))
    await waitFor(() => expect(hook.result.current.list.dartLoading).toBe(false))
    expect(shownRow()?.status).toBe('Done')
    expect(hook.result.current.list.dartTotalCount).toBe(1)
  })

  it('shows Dart’s value for field B while field A keeps its pending edit', async () => {
    const { host, taskId, hook, edit, shownRow, refresh } = await openListedPage()
    const release = host.hold('dart.updateTask')
    let write: Promise<unknown> = Promise.resolve()
    act(() => {
      write = edit('Done')
    })
    await waitFor(() => expect(host.count('dart.updateTask')).toBe(1))
    host.addTask({ ...host.tasks.get(taskId)!, priority: 'High' })

    act(refresh)
    await waitFor(() => expect(shownRow()?.priority).toBe('High'))

    expect(shownRow()?.status).toBe('Done')
    await waitFor(() => expect(hook.result.current.list.dartLoading).toBe(false))

    await act(async () => {
      release()
      await write
    })
  })

  it('pins a created row past the refresh that follows and counts it once', async () => {
    const { hook, refresh } = await openListedPage()
    const created = dartTaskFixture('cReAtEd12345', { status: 'Elsewhere', description: 'Long' })

    act(() => hook.result.current.list.noteDartTaskCreated(created))

    const ids = () => hook.result.current.list.dartTasks.map((task) => task.id)
    expect(ids()).toContain(created.id)
    expect(hook.result.current.list.dartTotalCount).toBe(2)
    expect(
      hook.result.current.list.dartTasks.find((task) => task.id === created.id)
    ).not.toHaveProperty('description')

    act(refresh)
    await waitFor(() => expect(hook.result.current.list.dartLoading).toBe(false))
    expect(ids()).toContain(created.id)
    expect(hook.result.current.list.dartTotalCount).toBe(2)

    act(refresh)
    await waitFor(() => expect(ids()).not.toContain(created.id))
    expect(hook.result.current.list.dartTotalCount).toBe(1)
  })
})
