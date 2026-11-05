// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../../shared/constants'
import type { DartWorkspaceConfig } from '../../../../../shared/dart/dart-types'
import { useAppStore } from '@/store'
import { installFakeDartRuntime } from '@/store/slices/dart/dart-fake-runtime.test-support'
import { getDartReadScope } from '@/store/slices/dart/dart-read-coordination'
import { useTaskPageDartCreation } from './use-task-page-dart-creation'
import { useDartCreateOpenKey } from './use-dart-create-state'

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
  useAppStore.setState({ dartCreateSessions: {}, dartCreateOwners: {}, activeView: 'tasks' })
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
  it('does not show an adopted unknown draft to a different account', () => {
    const { hook, openDraft } = setup(false)
    openDraft('Private draft')
    act(() => switchHost(null, true, viewer))
    expect(hook.result.current.createDraft.title).toBe('Private draft')
    expect(hook.result.current.createOpen).toBe(true)
    act(() => switchHost(null, true, { id: 'user-b', name: 'Other' }))
    expect(hook.result.current.createOpen).toBe(false)
    expect(hook.result.current.createDraft.title).not.toBe('Private draft')
  })

  it('keeps the draft and refusal after a 401 during submit', async () => {
    const { runtime, hook, openDraft, submit } = setup()
    runtime.host(null).refusals.push({
      ok: false,
      error: 'Dart rejected the API token.',
      errorCode: 'dart.unauthorized',
      outcome: 'notApplied'
    })
    openDraft()
    await waitFor(() => expect(hook.result.current.createWritesV2Pending).toBe(false))
    await act(async () => {
      await submit()
    })
    expect(hook.result.current.createOpen).toBe(true)
    expect(hook.result.current.accountChecking).toBe(true)
    expect(hook.result.current.createDraft.title).toBe('')
    expect(hook.result.current.createTokenRejected).toBe(true)
    act(() => switchHost(null))
    expect(hook.result.current.createDraft.title).toBe('Keep this draft')
    expect(hook.result.current.createNotice).toMatchObject({ kind: 'refused' })
  })

  it('retains the known account lock when the viewer becomes unknown', async () => {
    const { runtime, hook, openDraft, submit } = setup()
    const host = runtime.host(null)
    host.lostReplies.push({ ok: false, error: 'Lost reply', outcome: 'unknown' })
    openDraft()
    await waitFor(() => expect(hook.result.current.createWritesV2Pending).toBe(false))
    await act(async () => {
      await submit()
    })
    expect(hook.result.current.createMatches.map((task) => task.title)).toContain('Keep this draft')
    act(() => switchHost(null, false))
    expect(hook.result.current.createOpen).toBe(true)
    expect(hook.result.current.createDraft.title).toBe('')
    expect(hook.result.current.createMatches).toEqual([])
    expect(hook.result.current.createFieldsLocked).toBe(true)
    expect(hook.result.current.accountChecking).toBe(true)
    expect(
      useAppStore.getState().dartCreateSessions[JSON.stringify(['local', 'create', 'user-a'])]
        ?.unknown
    ).toBe(true)
    await act(async () => {
      await submit()
    })
    expect(host.count('dart.createTask')).toBe(1)
    act(() => switchHost(null))
    expect(hook.result.current.createDraft.title).toBe('Keep this draft')
    expect(hook.result.current.listChecked).toBe(false)
  })

  it('preserves the due date while a capability probe is pending', async () => {
    const probe = Promise.withResolvers<boolean>()
    const { hook, runtime, openDraft } = setup()
    const host = runtime.host(null)
    const supports = vi.spyOn(window.api.dart, 'supportsWritesV2').mockReturnValue(probe.promise)
    act(() => switchHost('host-b'))
    act(() => switchHost(null))
    openDraft('Due-date draft')
    act(() => hook.result.current.setCreateDraft({ dueAt: '2027-01-15' }))
    expect(hook.result.current.createWritesV2Pending).toBe(true)
    await act(async () => {
      await hook.result.current.createTask({
        title: 'Due-date draft',
        dartboard: 'Example/Platform',
        dueAt: '2027-01-15'
      })
      await hook.result.current.createAnyway()
    })
    expect(host.count('dart.createTask')).toBe(0)
    expect(hook.result.current.createDraft.dueAt).toBe('2027-01-15')
    await act(async () => {
      probe.resolve(true)
      await probe.promise
    })
    await act(async () => {
      await hook.result.current.createTask({
        title: 'Due-date draft',
        dartboard: 'Example/Platform',
        dueAt: '2027-01-15'
      })
    })
    expect(
      host.requests.find((request) => request.method === 'dart.createTask')?.params
    ).toMatchObject({ dueAt: '2027-01-15' })
    supports.mockRestore()
  })

  it('blocks Create anyway during a new capability probe then sends the preserved due date', async () => {
    const { hook, runtime, openDraft } = setup()
    const host = runtime.host(null)
    host.lostReplies.push({ ok: false, error: 'Lost reply', outcome: 'unknown' })
    openDraft('Due-date recovery')
    act(() => hook.result.current.setCreateDraft({ dueAt: '2027-01-15' }))
    await waitFor(() => expect(hook.result.current.createWritesV2Pending).toBe(false))
    await act(async () => {
      await hook.result.current.createTask({
        title: 'Due-date recovery',
        dartboard: 'Example/Platform',
        dueAt: '2027-01-15'
      })
    })
    act(() => hook.result.current.dismissMatches())
    const probe = Promise.withResolvers<boolean>()
    const supports = vi.spyOn(window.api.dart, 'supportsWritesV2').mockReturnValue(probe.promise)
    act(() => switchHost('host-b'))
    act(() => switchHost(null))
    expect(hook.result.current.createWritesV2Pending).toBe(true)
    await act(async () => {
      expect(await hook.result.current.createAnyway()).toMatchObject({
        ok: false,
        outcome: 'notApplied',
        error: 'Checking Dart capabilities.'
      })
    })
    expect(host.count('dart.createTask')).toBe(1)
    await act(async () => {
      probe.resolve(true)
      await probe.promise
    })
    await act(async () => {
      await hook.result.current.checkAgain()
    })
    act(() => hook.result.current.dismissMatches())
    await act(async () => {
      await hook.result.current.createAnyway()
    })
    const creates = host.requests.filter((request) => request.method === 'dart.createTask')
    expect(creates).toHaveLength(2)
    expect(creates[1].params).toMatchObject({ dueAt: '2027-01-15' })
    supports.mockRestore()
  })

  it('refuses unsupported due dates whether supplied as input or retained in the draft', async () => {
    const { hook, runtime, openDraft } = setup()
    const supports = vi.spyOn(window.api.dart, 'supportsWritesV2').mockResolvedValue(false)
    act(() => switchHost('host-b'))
    act(() => switchHost(null))
    openDraft('Date must not disappear')
    await waitFor(() => expect(hook.result.current.createWritesV2Pending).toBe(false))
    await act(async () => {
      expect(
        await hook.result.current.createTask({
          title: 'Date must not disappear',
          dartboard: 'Example/Platform',
          dueAt: '2027-01-15'
        })
      ).toMatchObject({ ok: false, outcome: 'notApplied' })
    })
    act(() => hook.result.current.setCreateDraft({ dueAt: '2027-01-15' }))
    await act(async () => {
      expect(
        await hook.result.current.createTask({
          title: 'Date must not disappear',
          dartboard: 'Example/Platform'
        })
      ).toMatchObject({ ok: false, outcome: 'notApplied' })
    })
    expect(runtime.host(null).count('dart.createTask')).toBe(0)
    expect(hook.result.current.createDraft.dueAt).toBe('2027-01-15')
    supports.mockRestore()
  })

  it('does not allow ordinary create after an unknown result even if the draft is editable', async () => {
    const { hook, runtime, openDraft, submit } = setup()
    const host = runtime.host(null)
    host.lostReplies.push({ ok: false, error: 'Lost reply', outcome: 'unknown' })
    openDraft()
    await waitFor(() => expect(hook.result.current.createWritesV2Pending).toBe(false))
    await act(async () => {
      await submit()
    })
    const key = JSON.stringify(['local', 'create', 'user-a'])
    act(() => useAppStore.getState().patchDartCreateSession(key, { editable: true, notice: null }))
    await act(async () => {
      expect(await submit()).toMatchObject({ ok: false, outcome: 'notApplied' })
    })
    expect(host.count('dart.createTask')).toBe(1)
  })

  it('adopts an unowned draft only after checking the account', async () => {
    const { hook, runtime, openDraft, submit } = setup(false)
    openDraft('Unowned draft')
    expect(hook.result.current.accountChecking).toBe(true)
    await act(async () => {
      await submit()
      await hook.result.current.checkAgain()
    })
    expect(runtime.host(null).count('dart.createTask')).toBe(0)
    expect(runtime.host(null).count('dart.listTasks')).toBe(0)
    expect(useAppStore.getState().dartCreateOwners.local).toBeUndefined()
    await act(async () => hook.result.current.retryAccountCheck!())
    expect(hook.result.current.accountChecking).toBe(false)
    expect(hook.result.current.createDraft.title).toBe('Unowned draft')
    expect(useAppStore.getState().dartCreateOwners.local?.activeOwner).toBe('user-a')
  })

  it('closes an open dialog when owner changes after a null viewer', () => {
    const key = JSON.stringify(['local', 'create', null])
    const hook = renderHook(
      ({ owner }: { owner: string | null }) => useDartCreateOpenKey(key, 'local', owner, key),
      { initialProps: { owner: 'user-a' as string | null } }
    )
    act(() => hook.result.current[1](key))
    hook.rerender({ owner: null })
    expect(hook.result.current[0]).toBe(key)
    hook.rerender({ owner: 'user-b' })
    expect(hook.result.current[0]).toBeNull()
  })

  it('keeps a previously known owner across a null viewer and closes for a different owner', () => {
    const { hook, openDraft } = setup()
    openDraft('A private draft')
    act(() => switchHost(null, false))
    expect(hook.result.current.createDraft.title).toBe('')
    act(() => switchHost(null, true, { id: 'user-b', name: 'Other' }))
    expect(hook.result.current.createOpen).toBe(false)
    expect(hook.result.current.createDraft.title).not.toBe('A private draft')
  })

  it('does not adopt a first owner or send a create while the viewer is null', async () => {
    const { hook, runtime, openDraft, submit } = setup(false)
    openDraft('Unowned draft')
    expect(
      useAppStore.getState().dartCreateSessions[JSON.stringify(['local', 'create', null])]?.draft
        .title
    ).toBe('Unowned draft')
    await act(async () => {
      await submit()
    })
    expect(useAppStore.getState().dartCreateOwners.local).toBeUndefined()
    expect(runtime.host(null).count('dart.createTask')).toBe(0)
    act(() => switchHost(null))
    expect(hook.result.current.createDraft.title).toBe('Unowned draft')
  })

  it('keeps B dialog open across a null viewer when A was first owner', () => {
    const { hook, openDraft } = setup()
    openDraft('A draft')
    const b = { id: 'user-b', name: 'Bea' }
    act(() => switchHost(null, true, b))
    openDraft('B draft')
    act(() => switchHost(null, false))
    expect(hook.result.current.createOpen).toBe(true)
    act(() => switchHost(null, true, b))
    expect(hook.result.current.createOpen).toBe(true)
    expect(hook.result.current.createDraft.title).toBe('B draft')
  })

  it('does not overwrite owner draft when opened with a null viewer', () => {
    const { hook, openDraft } = setup()
    openDraft('A draft')
    act(() => hook.result.current.setCreateDraft({ assignee: 'Keep me', dartboard: 'Other/Board' }))
    act(() => hook.result.current.closeCreate())
    act(() => switchHost(null, false))
    act(() => hook.result.current.openCreate())
    act(() => switchHost(null))
    expect(hook.result.current.createDraft).toMatchObject({
      assignee: 'Keep me',
      dartboard: 'Other/Board'
    })
  })

  it('invalidates the checked list when a recovery due date is refused', async () => {
    const { hook, runtime, openDraft } = setup()
    const host = runtime.host(null)
    host.lostReplies.push({ ok: false, error: 'Lost reply', outcome: 'unknown' })
    openDraft('Due recovery')
    act(() => hook.result.current.setCreateDraft({ dueAt: '2027-01-15' }))
    await waitFor(() => expect(hook.result.current.createWritesV2Pending).toBe(false))
    await act(async () => {
      await hook.result.current.createTask({
        title: 'Due recovery',
        dartboard: 'Example/Platform',
        dueAt: '2027-01-15'
      })
    })
    act(() => hook.result.current.dismissMatches())
    const supports = vi.spyOn(window.api.dart, 'supportsWritesV2').mockResolvedValue(false)
    act(() => switchHost('host-b'))
    act(() => switchHost(null))
    await waitFor(() => expect(hook.result.current.createWritesV2Pending).toBe(false))
    await act(async () => {
      await hook.result.current.checkAgain()
    })
    act(() => hook.result.current.dismissMatches())
    expect(hook.result.current.listChecked).toBe(true)
    await act(async () => {
      await hook.result.current.createAnyway()
    })
    expect(hook.result.current.listChecked).toBe(false)
    await act(async () => {
      await hook.result.current.createAnyway()
    })
    expect(host.count('dart.createTask')).toBe(1)
    supports.mockRestore()
  })

  it('requires a fresh lookup after correcting a refused recovery and sends the visible form', async () => {
    const { hook, runtime, openDraft, submit } = setup()
    const host = runtime.host(null)
    host.lostReplies.push({ ok: false, error: 'Lost reply', outcome: 'unknown' })
    openDraft()
    await waitFor(() => expect(hook.result.current.createWritesV2Pending).toBe(false))
    await act(async () => {
      await submit()
    })
    act(() => hook.result.current.dismissMatches())
    host.refusals.push({ ok: false, error: 'Fix the title', errorCode: 'dart.badRequest' })
    await act(async () => {
      await hook.result.current.createAnyway()
    })
    expect(hook.result.current.createFieldsLocked).toBe(false)
    act(() => hook.result.current.setCreateDraft({ title: 'Corrected title' }))
    expect(hook.result.current.listChecked).toBe(false)
    await act(async () => {
      await hook.result.current.createAnyway()
    })
    expect(host.count('dart.createTask')).toBe(2)
    await act(async () => {
      await hook.result.current.checkAgain()
    })
    act(() => hook.result.current.dismissMatches())
    await act(async () => {
      await hook.result.current.createAnyway()
    })
    const creates = host.requests.filter((request) => request.method === 'dart.createTask')
    expect(creates).toHaveLength(3)
    expect(creates[2].params).toMatchObject({
      title: 'Corrected title',
      dartboard: 'Example/Platform'
    })
  })

  it('invalidates an in-flight lookup across an A-B-A owner transition', async () => {
    const { hook, runtime, openDraft, submit } = setup()
    const host = runtime.host(null)
    host.lostReplies.push({ ok: false, error: 'Lost reply', outcome: 'unknown' })
    const release = host.hold('dart.listTasks')
    openDraft()
    await waitFor(() => expect(hook.result.current.createWritesV2Pending).toBe(false))
    let pending: Promise<unknown>
    act(() => {
      pending = submit()
    })
    await waitFor(() => expect(host.count('dart.listTasks')).toBeGreaterThan(0))
    act(() => switchHost(null, true, { id: 'user-b', name: 'Other' }))
    act(() => switchHost(null))
    await act(async () => {
      release()
      await pending
    })
    expect(hook.result.current.listChecked).toBe(false)
    await act(async () => {
      await hook.result.current.createAnyway()
    })
    expect(host.count('dart.createTask')).toBe(1)
  })

  it('does not register a stale host viewer or run actions without a current viewer', async () => {
    const { runtime, hook, opened, openDraft, submit } = setup()
    openDraft()
    const staleCreate = hook.result.current.createTask
    const staleCheck = hook.result.current.checkAgain
    const staleAnyway = hook.result.current.createAnyway
    const staleClaim = hook.result.current.claimCreateMatch
    const task = {
      id: 'task-1',
      title: 'Existing',
      htmlUrl: 'https://app.dartai.com/t/task-1',
      status: 'To-do',
      priority: 'Medium',
      tags: []
    }
    act(() => {
      const settings = { ...getDefaultSettings('/home/alex'), activeRuntimeEnvironmentId: 'host-b' }
      useAppStore.setState({ settings })
    })
    expect(useAppStore.getState().dartCreateOwners['runtime:host-b']).toBeUndefined()
    expect(hook.result.current.createOpen).toBe(false)
    act(() => hook.result.current.openCreate())
    expect(hook.result.current.accountChecking).toBe(true)
    expect(hook.result.current.createFieldsLocked).toBe(true)
    await act(async () => {
      await submit()
      await staleCreate({ title: 'Stale', dartboard: 'Example/Platform' })
      await staleAnyway()
      await staleCheck()
      staleClaim!(task)
      await hook.result.current.checkAgain()
    })
    expect(runtime.host(null).count('dart.createTask')).toBe(0)
    expect(runtime.host('host-b').count('dart.createTask')).toBe(0)
    expect(runtime.host('host-b').count('dart.listTasks')).toBe(0)
    expect(opened).not.toHaveBeenCalled()
    await act(async () => hook.result.current.retryAccountCheck!())
    expect(runtime.host('host-b').count('dart.status')).toBe(1)
    expect(hook.result.current.accountChecking).toBe(false)
    expect(useAppStore.getState().dartCreateOwners['runtime:host-b']?.activeOwner).toBe('user-a')
  })

  it('keeps A locked while B creates independently without leaking drafts', async () => {
    const { runtime, hook, openDraft, submit } = setup()
    const host = runtime.host(null)
    host.lostReplies.push({ ok: false, error: 'Lost reply', outcome: 'unknown' })
    openDraft()
    await waitFor(() => expect(hook.result.current.createWritesV2Pending).toBe(false))
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
    await waitFor(() => expect(hook.result.current.createWritesV2Pending).toBe(false))
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
    await waitFor(() => expect(hook.result.current.createWritesV2Pending).toBe(false))
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
    await waitFor(() => expect(hook.result.current.createWritesV2Pending).toBe(false))
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
    await waitFor(() => expect(hook.result.current.createWritesV2Pending).toBe(false))
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
    expect(host.count('dart.listTasks')).toBe(0)
    expect(runtime.host('host-b').count('dart.listTasks')).toBe(0)
    act(() => switchHost(null))
    await act(async () => hook.result.current.checkAgain())
    expect(
      useAppStore.getState().dartCreateSessions[JSON.stringify(['local', 'create', 'user-a'])]
        ?.unknown
    ).toBe(true)
    expect(hook.result.current.createMatches[0]?.title).toBe('Keep this draft')
  })
})
