// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DartTask, DartWorkspaceConfig } from '../../../../../shared/dart/dart-types'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { useAppStore } from '@/store'
import type { DartClientResult } from '@/runtime/runtime-dart-client'
import {
  dartTaskFixture,
  installFakeDartRuntime
} from '@/store/slices/dart/dart-fake-runtime.test-support'
import { getDartReadScope } from '@/store/slices/dart/dart-read-coordination'
import { bumpDartEpochs } from '@/store/slices/dart/dart-task-identity'
import { useDartTaskDetailData } from './use-dart-task-detail-data'
import { useTaskPageDartState, type TaskPageDartStateInput } from './use-task-page-dart-state'

type PageInput = Omit<TaskPageDartStateInput, 'providerRuntimeContextKey'>

const viewer = { id: 'uSeR1d2e3f4g', name: 'Alex Example' }
const task: DartTask = {
  id: 'aB3dE5gH7jK9',
  title: 'Search results ignore archived projects',
  htmlUrl: 'https://app.dartai.com/t/aB3dE5gH7jK9',
  tags: []
}

function setup(overrides: Partial<PageInput> = {}) {
  const settings = useAppStore.getState().settings
  useAppStore.setState({
    dartStatus: { connected: true, viewer },
    dartStatusContextKey: getDartReadScope(settings).contextKey
  })
  const listDartTasks = vi.fn(() =>
    Promise.resolve({ ok: true as const, tasks: [task], totalCount: 1 })
  )
  const input: PageInput = {
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
  const hook = renderHook(() =>
    useTaskPageDartState({
      ...input,
      providerRuntimeContextKey: useAppStore((s) => getProviderRuntimeContextKey(s.settings))
    })
  )
  return { listDartTasks, hook }
}

describe('useTaskPageDartState', () => {
  afterEach(cleanup)
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

  it('clears account A config while account B config is pending', async () => {
    const settings = useAppStore.getState().settings
    useAppStore.setState({
      dartStatus: { connected: true, viewer },
      dartStatusContextKey: getDartReadScope(settings).contextKey
    })
    const pending = Promise.withResolvers<DartClientResult<{ config: DartWorkspaceConfig }>>()
    const configA = {
      dartboards: ['Private A'],
      statuses: [],
      types: [],
      tags: [],
      priorities: [],
      sizes: [],
      assignees: []
    }
    const fetchDartConfig = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, config: configA })
      .mockReturnValueOnce(pending.promise)
    const { hook } = setup({ fetchDartConfig })
    await waitFor(() => expect(hook.result.current.dartConfig).toEqual(configA))
    act(() =>
      useAppStore.setState({ dartStatus: { connected: true, viewer: { id: 'user-b', name: 'B' } } })
    )
    expect(hook.result.current.dartConfig).toBeNull()
    expect(fetchDartConfig).toHaveBeenCalledTimes(2)
    const configB = { ...configA, dartboards: ['Board B'] }
    await act(async () => pending.resolve({ ok: true, config: configB }))
    await waitFor(() => expect(hook.result.current.dartConfig).toEqual(configB))
  })

  it('resets board and assignee filters when the account changes', async () => {
    const { hook } = setup()
    act(() => {
      hook.result.current.setDartFilter('mine', false)
      hook.result.current.setDartFilter('dartboard', 'Example/Platform')
      hook.result.current.setDartFilter('status', 'To-do')
    })
    act(() =>
      useAppStore.setState({ dartStatus: { connected: true, viewer: { id: 'user-b', name: 'B' } } })
    )
    expect(hook.result.current.dartFilters).toMatchObject({
      mine: true,
      dartboard: null,
      status: 'To-do'
    })
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
  function openPage(detailEnv?: string, board = false) {
    nextHost += 1
    const env = `list-host-${nextHost}`
    const taskId = `taskListed${String(nextHost).padStart(3, '0')}`
    const host = runtime.host(env)
    // These cases pin phase 2's list-only reads; the board path has its own describe.
    host.board = board
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
    const input: PageInput = {
      taskSource: 'dart',
      dartConnected: true,
      dartStatus: { connected: true, viewer: fakeViewer },
      dartTaskSourceContext: context,
      linearAttachmentWorkspaces: [],
      listDartTasks: state.listDartTasks,
      fetchDartTask: state.fetchDartTask,
      fetchDartConfig: state.fetchDartConfig
    }
    const hook = renderHook(() => {
      const pageKey = useAppStore((s) => getProviderRuntimeContextKey(s.settings))
      return {
        list: useTaskPageDartState({ ...input, providerRuntimeContextKey: pageKey }),
        detail: useDartTaskDetailData(row, context, pageKey)
      }
    })
    const edit = (status: string) => hook.result.current.detail.onUpdate({ status }, { status })
    const shownRow = () => hook.result.current.list.dartTasks.find((task) => task.id === taskId)
    const refresh = () => hook.result.current.list.setDartRefreshNonce((nonce) => nonce + 1)
    return { host, taskId, hook, edit, shownRow, refresh }
  }

  async function openListedPage(detailEnv?: string, board = false) {
    const page = openPage(detailEnv, board)
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

  /** Same viewer, another host with one task of its own. */
  function switchToNewHost(taskId: string) {
    const env = `list-next-host-${nextHost}`
    const host = runtime.host(env)
    host.board = false
    host.addTask(dartTaskFixture(taskId))
    const settings = { ...useAppStore.getState().settings!, activeRuntimeEnvironmentId: env }
    return {
      env,
      host,
      go: () =>
        act(() =>
          useAppStore.setState({
            settings,
            dartStatusContextKey: getDartReadScope(settings).contextKey
          })
        )
    }
  }

  it('drops the pinned rows of the last host when the host changes', async () => {
    const { hook, edit, taskId } = await openListedPage()
    await act(async () => {
      await edit('Done')
    })
    const next = switchToNewHost('taskOnNextHost')

    next.go()

    const ids = () => hook.result.current.list.dartTasks.map((task) => task.id)
    await waitFor(() => expect(ids()).toEqual(['taskOnNextHost']))
    expect(ids()).not.toContain(taskId)
    expect(hook.result.current.list.dartTotalCount).toBe(1)
  })

  it('does not keep the last host’s rows when every read of the new host is overtaken', async () => {
    const { hook } = await openListedPage()
    const next = switchToNewHost('taskOnNextHost')
    const handle = next.host.handle.bind(next.host)
    next.host.handle = (method, params) => {
      if (method === 'dart.listTasks') {
        bumpDartEpochs({ hostKey: `runtime:${next.env}`, accountKey: fakeViewer.id })
      }
      return handle(method, params)
    }

    next.go()

    await waitFor(() => expect(next.host.count('dart.listTasks')).toBe(3))
    await waitFor(() =>
      expect(hook.result.current.list.dartTasks.map((task) => task.id)).toEqual(['taskOnNextHost'])
    )
    expect(hook.result.current.list.dartTotalCount).toBe(1)
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

describe('useTaskPageDartState on a board host', () => {
  let runtime: ReturnType<typeof installFakeDartRuntime>
  let nextEnv = 0
  const realWindow = window
  const boardViewer = { id: 'user-a', name: 'Alex Example' }

  beforeEach(() => {
    localStorage.clear()
    runtime = installFakeDartRuntime()
    const api = window.api
    vi.stubGlobal('window', realWindow)
    Object.assign(realWindow, { api })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function finishedTask(index: number): DartTask {
    return dartTaskFixture(`finished${String(index).padStart(4, '0')}`, {
      title: `Finished ${index}`,
      status: 'Done',
      completedAt: new Date(Date.UTC(2026, 0, 1) + index * 60_000).toISOString()
    })
  }

  function openBoardPage(args: { finished?: number; board?: boolean; viewer?: boolean } = {}) {
    nextEnv += 1
    const env = `board-host-${nextEnv}`
    const host = runtime.host(env)
    host.board = args.board !== false
    host.addTask(dartTaskFixture(`open${nextEnv}aaaaaaa`, { title: 'Open one', status: 'To-do' }))
    host.addTask(
      dartTaskFixture(`open${nextEnv}bbbbbbb`, {
        title: 'Open two',
        status: 'Doing',
        tags: ['backend'],
        priority: 'High'
      })
    )
    for (let index = 0; index < (args.finished ?? 0); index += 1) {
      host.addTask(finishedTask(index))
    }
    const settings = { ...useAppStore.getState().settings!, activeRuntimeEnvironmentId: env }
    const viewerValue = args.viewer === false ? null : boardViewer
    useAppStore.setState({
      settings,
      dartStatus: { connected: true, viewer: viewerValue },
      dartStatusChecked: true,
      dartStatusContextKey: getDartReadScope(settings).contextKey,
      dartListCache: {},
      dartScopeMetaCache: {}
    })
    const state = useAppStore.getState()
    const input: PageInput = {
      taskSource: 'dart',
      dartConnected: true,
      dartStatus: { connected: true, viewer: viewerValue },
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
    const meta = () => hook.result.current.dartScopeMeta
    return { env, host, hook, listRequests, meta }
  }

  it('reads open and finished pages through the scope reads and lists them together', async () => {
    const { hook, listRequests, meta } = openBoardPage({ finished: 3 })

    await waitFor(() => expect(hook.result.current.dartTasks).toHaveLength(5))

    expect(hook.result.current.dartBoardPath).toBe(true)
    expect(listRequests().map(({ params }) => params.isCompleted)).toEqual([false, true])
    expect(meta()).toMatchObject({ openTotal: 2, doneTotal: 3, incomplete: false })
  })

  it('keeps filters across a layout switch and remembers the layout through a remount', async () => {
    const first = openBoardPage()
    await waitFor(() => expect(first.hook.result.current.dartBoardPath).toBe(true))
    act(() => first.hook.result.current.setDartFilter('tag', 'backend'))

    act(() => first.hook.result.current.setDartLayout('board'))

    expect(first.hook.result.current.dartFilters.tag).toBe('backend')
    expect(first.hook.result.current.dartLayout).toBe('board')
    expect(JSON.parse(localStorage.getItem('orca.dart.view-mode.v1') ?? 'null')).toEqual({
      layout: 'board'
    })
    first.hook.unmount()
    const second = openBoardPage()
    await waitFor(() => expect(second.hook.result.current.dartLayout).toBe('board'))

    act(() => second.hook.result.current.setDartLayout('list'))

    expect(localStorage.getItem('orca.dart.view-mode.v1')).toBeNull()
  })

  it('applies status, tag, priority and on-hold client filters with no request', async () => {
    const { hook, listRequests, meta } = openBoardPage({ finished: 2 })
    await waitFor(() => expect(hook.result.current.dartTasks).toHaveLength(4))
    const requests = listRequests().length
    const before = meta()

    act(() => hook.result.current.setDartFilter('status', 'Doing'))
    expect(hook.result.current.dartTasks.map((task) => task.title)).toEqual(['Open two'])
    act(() => hook.result.current.setDartFilter('status', null))
    act(() => hook.result.current.setDartFilter('tag', 'backend'))
    expect(hook.result.current.dartTasks).toHaveLength(1)
    act(() => hook.result.current.setDartFilter('tag', null))
    act(() => hook.result.current.setDartFilter('priority', 'high'))
    expect(hook.result.current.dartTasks).toHaveLength(1)
    act(() => hook.result.current.setDartFilter('priority', null))
    act(() => hook.result.current.setDartFilter('onHold', true))
    expect(hook.result.current.dartTasks).toHaveLength(0)

    await act(async () => {})
    expect(listRequests()).toHaveLength(requests)
    expect(meta()).toEqual(before)
  })

  it('continues "Show 50 more" by raw offset after a client filter change, with no duplicates', async () => {
    const { hook, listRequests, meta } = openBoardPage({ finished: 160 })
    await waitFor(() => expect(meta()?.doneTotal).toBe(160))
    for (const expectedOffset of [50, 100]) {
      await act(async () => hook.result.current.dartBoardModel.showMoreDone())
      await waitFor(() => expect(meta()?.doneOffset).toBe(expectedOffset + 50))
    }
    const generation = meta()?.generation
    const requests = listRequests().length

    act(() => hook.result.current.setDartFilter('status', 'Done'))
    act(() => hook.result.current.setDartFilter('tag', 'backend'))
    act(() => hook.result.current.setDartFilter('tag', null))
    act(() => hook.result.current.setDartFilter('status', null))

    expect(listRequests()).toHaveLength(requests)
    expect(meta()).toMatchObject({ doneOffset: 150, generation })
    await act(async () => hook.result.current.dartBoardModel.showMoreDone())
    await waitFor(() => expect(meta()?.doneOffset).toBe(160))
    expect(listRequests().at(-1)?.params).toMatchObject({ isCompleted: true, offset: 150 })
    const ids = hook.result.current.dartTasks.map((task) => task.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(162)
  })

  it('refreshes quietly: rows stay on screen while the read runs', async () => {
    const { host, hook } = openBoardPage()
    await waitFor(() => expect(hook.result.current.dartTasks).toHaveLength(2))
    const release = host.hold('dart.listTasks')

    act(() => hook.result.current.setDartRefreshNonce((n) => n + 1))

    await waitFor(() => expect(hook.result.current.dartLoading).toBe(true))
    expect(hook.result.current.dartTasks).toHaveLength(2)
    await act(async () => release())
    await waitFor(() => expect(hook.result.current.dartLoading).toBe(false))
  })

  it('refreshes once when the window turns visible after 2 minutes, never before', async () => {
    const { hook, listRequests, meta } = openBoardPage()
    await waitFor(() => expect(meta()?.fetchedAt).toBeGreaterThan(0))
    const start = Date.now()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(start + 60_000)
    const reads = listRequests().length

    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    await act(async () => {})
    expect(listRequests()).toHaveLength(reads)

    vi.setSystemTime(start + 3 * 60_000)
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    await waitFor(() => expect(listRequests().length).toBeGreaterThan(reads))
    await waitFor(() => expect(hook.result.current.dartLoading).toBe(false))
    const afterRefresh = listRequests().length
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    await act(async () => {})

    expect(listRequests()).toHaveLength(afterRefresh)
  })

  it('shows "changed" and keeps the rows when every re-read is overtaken', async () => {
    const { env, host, hook, meta } = openBoardPage()
    await waitFor(() => expect(hook.result.current.dartTasks).toHaveLength(2))
    const fetchedAt = meta()?.fetchedAt
    const handle = host.handle.bind(host)
    host.handle = (method, params) => {
      if (method === 'dart.listTasks') {
        bumpDartEpochs({ hostKey: `runtime:${env}`, accountKey: boardViewer.id })
      }
      return handle(method, params)
    }

    act(() => hook.result.current.setDartRefreshNonce((n) => n + 1))

    await waitFor(() => expect(meta()?.partialReason).toBe('changed'))
    expect(meta()?.fetchedAt).toBe(fetchedAt)
    expect(hook.result.current.dartTasks).toHaveLength(2)
  })

  it('reads again after a write overtakes a refresh and publishes the settled rows', async () => {
    const { host, hook, edit, shownRow, refresh } = await openOnBoardHost()
    const release = host.hold('dart.listTasks')
    act(refresh)
    await waitFor(() => expect(host.count('dart.listTasks')).toBe(3))

    await act(async () => {
      await edit('Done')
    })
    await act(async () => release())

    await waitFor(() => expect(hook.result.current.list.dartScopeMeta?.partialReason).toBeNull())
    await waitFor(() => expect(shownRow()?.status).toBe('Done'))
    expect(host.count('dart.listTasks')).toBeGreaterThan(4)
  })

  async function openOnBoardHost() {
    nextEnv += 1
    const env = `board-write-host-${nextEnv}`
    const taskId = `taskBoard${String(nextEnv).padStart(4, '0')}`
    const host = runtime.host(env)
    host.board = true
    host.addTask(dartTaskFixture(taskId, { description: 'Only the detail shows this' }))
    const settings = { ...useAppStore.getState().settings!, activeRuntimeEnvironmentId: env }
    useAppStore.setState({
      settings,
      dartStatus: { connected: true, viewer: boardViewer },
      dartStatusChecked: true,
      dartStatusContextKey: getDartReadScope(settings).contextKey,
      dartListCache: {},
      dartScopeMetaCache: {}
    })
    const context: TaskSourceContext = {
      kind: 'task-source',
      provider: 'dart',
      projectId: 'project-1',
      hostId: `runtime:${env}`,
      providerIdentity: { provider: 'dart', userId: boardViewer.id }
    }
    const state = useAppStore.getState()
    const input: PageInput = {
      taskSource: 'dart',
      dartConnected: true,
      dartStatus: { connected: true, viewer: boardViewer },
      dartTaskSourceContext: context,
      linearAttachmentWorkspaces: [],
      listDartTasks: state.listDartTasks,
      fetchDartTask: state.fetchDartTask,
      fetchDartConfig: state.fetchDartConfig
    }
    const row = dartTaskFixture(taskId)
    const hook = renderHook(() => {
      const pageKey = useAppStore((s) => getProviderRuntimeContextKey(s.settings))
      return {
        list: useTaskPageDartState({ ...input, providerRuntimeContextKey: pageKey }),
        detail: useDartTaskDetailData(row, context, pageKey)
      }
    })
    const edit = (status: string) => hook.result.current.detail.onUpdate({ status }, { status })
    const shownRow = () => hook.result.current.list.dartTasks.find((task) => task.id === taskId)
    const refresh = () => hook.result.current.list.setDartRefreshNonce((nonce) => nonce + 1)
    await waitFor(() => expect(shownRow()).toBeTruthy())
    await waitFor(() => expect(hook.result.current.detail.full.status).toBe('ready'))
    return { host, hook, edit, shownRow, refresh }
  }

  it('shows an edited row from the store with no read and a created row on top without storing it', async () => {
    const { host, hook, edit, shownRow, refresh } = await openOnBoardHost()
    const reads = host.count('dart.listTasks')

    await act(async () => {
      await edit('Doing')
    })
    expect(shownRow()?.status).toBe('Doing')
    expect(host.count('dart.listTasks')).toBe(reads)

    const created = dartTaskFixture('cReAtEd12345', { status: 'Elsewhere' })
    act(() => hook.result.current.list.noteDartTaskCreated(created))
    const ids = () => hook.result.current.list.dartTasks.map((task) => task.id)
    expect(ids()[0]).toBe(created.id)
    const stored = () =>
      Object.values(useAppStore.getState().dartListCache).flatMap(
        (entry) => entry.data?.tasks.map((task) => task.id) ?? []
      )
    expect(stored()).not.toContain(created.id)

    act(refresh)
    await waitFor(() => expect(hook.result.current.list.dartLoading).toBe(false))
    expect(ids()).toContain(created.id)
    act(refresh)
    await waitFor(() => expect(ids()).not.toContain(created.id))
  })

  it('lists nothing and sends no request for "mine" without a viewer id', async () => {
    const { hook, listRequests } = openBoardPage({ viewer: false })
    await waitFor(() => expect(hook.result.current.dartBoardPath).toBe(true))
    await waitFor(() => expect(hook.result.current.dartLoading).toBe(false))

    expect(listRequests()).toHaveLength(0)
    expect(hook.result.current.dartTasks).toEqual([])
    expect(hook.result.current.dartScopeMeta?.openTotal).toBe(0)
  })

  it('keeps phase 2 reads and disables the switch on a host without the board', async () => {
    const { hook, listRequests } = openBoardPage({ board: false })

    await waitFor(() => expect(hook.result.current.dartTasks).toHaveLength(2))

    expect(hook.result.current.dartBoardPath).toBe(false)
    expect(hook.result.current.dartLayoutSwitchDisabledReason).toBe('oldHost')
    expect(hook.result.current.dartLayout).toBe('list')
    expect(listRequests().map(({ params }) => params)).toEqual([
      expect.objectContaining({ limit: 100 })
    ])
    expect(listRequests()[0]?.params).not.toHaveProperty('order')
  })

  it('turns linked mode off when a saved view is applied', async () => {
    const { host, hook } = openBoardPage()
    host.savedViewState = {
      views: [
        {
          id: 'view-one',
          name: 'Everything',
          filters: {
            mine: false,
            status: null,
            dartboard: null,
            search: '',
            tag: 'backend',
            priority: null,
            onHold: false
          },
          layout: 'board',
          showEmptyColumns: true
        }
      ],
      activeViewId: null
    }
    await waitFor(() => expect(hook.result.current.dartBoardPath).toBe(true))
    await waitFor(() => expect(hook.result.current.dartSavedViews.views).toHaveLength(1))
    act(() => hook.result.current.setDartHasWorkspace(true))
    expect(hook.result.current.dartLayoutSwitchDisabledReason).toBe('linked')
    expect(hook.result.current.dartLayout).toBe('list')

    await act(async () => {
      await hook.result.current.dartSavedViews.apply('view-one')
    })

    expect(hook.result.current.dartHasWorkspace).toBe(false)
    expect(hook.result.current.dartFilters).toMatchObject({ mine: false, tag: 'backend' })
    expect(hook.result.current.dartLayout).toBe('board')
    expect(hook.result.current.dartShowEmptyColumns).toBe(true)
    expect(hook.result.current.dartSavedViews.modified).toBe(false)
    act(() => hook.result.current.setDartFilter('tag', null))
    expect(hook.result.current.dartSavedViews.modified).toBe(true)
  })
})
