// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../../shared/constants'
import type { DartWorkspaceConfig } from '../../../../../shared/dart/dart-types'
import { useAppStore } from '@/store'
import { installFakeDartRuntime } from '@/store/slices/dart/dart-fake-runtime.test-support'
import { getDartReadScope } from '@/store/slices/dart/dart-read-coordination'
import { useTaskPageDartCreation } from './use-task-page-dart-creation'

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
const viewer = { id: 'user-a', name: 'Alex Example' }
const config: DartWorkspaceConfig = {
  dartboards: ['Example/Platform'],
  statuses: [],
  types: [],
  priorities: [],
  tags: [],
  sizes: [],
  assignees: []
}
const realWindow = window

function switchHost(environmentId: string | null, knownViewer = true, account = viewer): void {
  const settings = {
    ...getDefaultSettings('/home/alex'),
    activeRuntimeEnvironmentId: environmentId
  }
  useAppStore.setState({
    settings,
    dartStatus: { connected: true, viewer: knownViewer ? account : null },
    dartStatusContextKey: getDartReadScope(settings).contextKey
  })
}

function setup(knownViewer = true) {
  const runtime = installFakeDartRuntime()
  const api = window.api
  vi.stubGlobal('window', realWindow)
  Object.assign(realWindow, { api })
  useAppStore.setState({ dartCreateSessions: {}, activeView: 'tasks' })
  switchHost(null, knownViewer)
  const opened = vi.fn()
  const hook = renderHook(() => {
    const dartStatus = useAppStore((state) => state.dartStatus)
    return useTaskPageDartCreation({
      taskSource: 'dart',
      dartConnected: true,
      dartUpdateRequired: false,
      dartConfig: config,
      dartFilters: { mine: false, status: null, dartboard: null, search: '' },
      dartStatus,
      setDartRefreshNonce: vi.fn(),
      noteDartTaskCreated: vi.fn(),
      openDartDetailPage: opened
    })
  })
  const openDraft = (title = 'Keep this draft'): void => {
    act(() => {
      hook.result.current.openCreate()
      hook.result.current.setCreateDraft({ title })
    })
  }
  const submit = () =>
    hook.result.current.createTask({ title: 'Keep this draft', dartboard: 'Example/Platform' })
  return { runtime, hook, opened, openDraft, submit }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  useAppStore.setState({ dartCreateSessions: {} })
})

describe('Dart create session identity and lifetime', () => {
  it('retains the known account lock when the viewer becomes unknown', async () => {
    const { runtime, hook, openDraft, submit } = setup()
    const host = runtime.host(null)
    host.lostReplies.push({ ok: false, error: 'Lost reply', outcome: 'unknown' })
    openDraft()
    await act(async () => {
      await submit()
    })
    act(() => switchHost(null, false))
    expect(hook.result.current.createOpen).toBe(true)
    expect(hook.result.current.createDraft.title).toBe('Keep this draft')
    expect(
      useAppStore.getState().dartCreateSessions[JSON.stringify(['local', 'create', 'user-a'])]
        ?.unknown
    ).toBe(true)
    await act(async () => {
      await submit()
    })
    expect(host.count('dart.createTask')).toBe(1)
  })

  it('keeps A locked while B creates independently without leaking drafts', async () => {
    const { runtime, hook, openDraft, submit } = setup()
    const host = runtime.host(null)
    host.lostReplies.push({ ok: false, error: 'Lost reply', outcome: 'unknown' })
    openDraft()
    await act(async () => {
      await submit()
    })
    expect(host.count('dart.createTask')).toBe(1)
    act(() => switchHost(null, true, { id: 'user-b', name: 'Blair Example' }))
    expect(
      useAppStore.getState().dartCreateSessions[JSON.stringify(['local', 'create', 'user-b'])]
    ).toBeUndefined()
    openDraft('B draft')
    expect(hook.result.current.createDraft.title).toBe('B draft')
    expect(
      useAppStore.getState().dartCreateSessions[JSON.stringify(['local', 'create', 'user-b'])]
        ?.draft.title
    ).toBe('B draft')
    await act(async () => {
      await hook.result.current.createTask({ title: 'B draft', dartboard: 'Example/Platform' })
    })
    expect(host.count('dart.createTask')).toBe(2)
    expect(
      useAppStore.getState().dartCreateSessions[JSON.stringify(['local', 'create', 'user-b'])]
    ).toBeUndefined()
    expect(useAppStore.getState().dartCreateOwners['local']?.activeOwner).toBe('user-b')
    act(() => switchHost(null))
    expect(
      useAppStore.getState().dartCreateSessions[JSON.stringify(['local', 'create', 'user-a'])]
        ?.unknown
    ).toBe(true)
    expect(hook.result.current.createDraft.title).toBe('Keep this draft')
    await act(async () => {
      await submit()
    })
    expect(host.count('dart.createTask')).toBe(2)
  })

  it('does not open on B after late success on A', async () => {
    const { runtime, hook, opened, openDraft, submit } = setup()
    const release = runtime.host(null).hold('dart.createTask')
    openDraft()
    let pending: Promise<unknown> = Promise.resolve()
    act(() => {
      pending = submit()
    })
    await waitFor(() => expect(runtime.host(null).count('dart.createTask')).toBe(1))
    act(() => switchHost(null, true, { id: 'user-b', name: 'Blair Example' }))
    await act(async () => {
      release()
      await pending
    })
    expect(opened).not.toHaveBeenCalled()
    expect(hook.result.current.createOpen).toBe(false)
    expect(
      useAppStore.getState().dartCreateSessions[JSON.stringify(['local', 'create', 'user-a'])]
    ).toBeUndefined()
  })

  it('keeps B open and intact when a late A create succeeds', async () => {
    const { runtime, hook, opened, openDraft, submit } = setup()
    const release = runtime.host(null).hold('dart.createTask')
    openDraft()
    let pending: Promise<unknown> = Promise.resolve()
    act(() => {
      pending = submit()
    })
    await waitFor(() => expect(runtime.host(null).count('dart.createTask')).toBe(1))
    act(() => switchHost(null, true, { id: 'user-b', name: 'Blair Example' }))
    openDraft('B draft')
    await act(async () => {
      release()
      await pending
    })
    expect(hook.result.current.createOpen).toBe(true)
    expect(hook.result.current.createDraft.title).toBe('B draft')
    expect(opened).not.toHaveBeenCalled()
  })

  it('looks up a late unknown result only on its original host', async () => {
    const { runtime, hook, openDraft, submit } = setup()
    const host = runtime.host(null)
    host.lostReplies.push({ ok: false, error: 'Lost reply', outcome: 'unknown' })
    const release = host.hold('dart.createTask')
    openDraft()
    let pending: Promise<unknown> = Promise.resolve()
    act(() => {
      pending = submit()
    })
    await waitFor(() => expect(host.count('dart.createTask')).toBe(1))
    act(() => switchHost('host-b'))
    await act(async () => {
      release()
      await pending
    })
    expect(host.count('dart.listTasks')).toBe(1)
    expect(runtime.host('host-b').count('dart.listTasks')).toBe(0)
    act(() => switchHost(null))
    expect(
      useAppStore.getState().dartCreateSessions[JSON.stringify(['local', 'create', 'user-a'])]
        ?.unknown
    ).toBe(true)
    expect(hook.result.current.createMatches[0]?.title).toBe('Keep this draft')
  })
})
