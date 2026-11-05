// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'

import { useState } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DartWorkspaceConfig } from '../../../../../shared/dart/dart-types'
import { getDefaultSettings } from '../../../../../shared/constants'
import { TooltipProvider } from '@/components/ui/tooltip'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { useAppStore } from '@/store'
import {
  installFakeDartRuntime,
  dartTaskFixture,
  type FakeDartHost
} from '@/store/slices/dart/dart-fake-runtime.test-support'
import { getDartReadScope } from '@/store/slices/dart/dart-read-coordination'
import { TaskPageDartCreateDialog, type DartCreateDialogModel } from './TaskCreateDialog'
import { useTaskPageDartCreation } from './use-task-page-dart-creation'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const A = { id: 'user-a', name: 'Alex Example' }

const config: DartWorkspaceConfig = {
  dartboards: ['Example/Platform', 'Example/Platform/Search'],
  statuses: ['To-do'],
  types: [],
  tags: [],
  priorities: [],
  sizes: [],
  assignees: []
}
const realWindow = window
let runtime: ReturnType<typeof installFakeDartRuntime>
let host: FakeDartHost
let setCfg: (c: DartWorkspaceConfig | null) => void = () => {}
let latest: DartCreateDialogModel

const settingsFor = (environmentId: string | null) => ({
  ...getDefaultSettings('/home/alex'),
  activeRuntimeEnvironmentId: environmentId
})

beforeEach(() => {
  runtime = installFakeDartRuntime()
  const api = window.api
  vi.stubGlobal('window', realWindow)
  Object.assign(realWindow, { api })
  host = runtime.host(null)
  host.connection = { connected: true, viewer: A }
  const settings = settingsFor(null)
  useAppStore.setState({
    dartCreateSessions: {},
    dartCreateOwners: {},
    settings,
    persistedUIReady: true,
    activeView: 'tasks',
    dartStatus: { connected: true, viewer: A },
    dartStatusContextKey: getDartReadScope(settings).contextKey,
    dartStatusChecked: true,
    dartUpdateRequired: false
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function switchTo(environmentId: string | null, viewer: typeof A | null): void {
  const settings = settingsFor(environmentId)
  useAppStore.setState({
    settings,
    dartStatus: { connected: true, viewer },
    dartStatusContextKey: getDartReadScope(settings).contextKey
  })
}
function renderDialog(initial: DartWorkspaceConfig | null = config) {
  function View(): React.JSX.Element {
    const [cfg, setC] = useState(initial)
    setCfg = setC
    const dartStatus = useAppStore((s) => s.dartStatus)
    const current = useAppStore((s) => s.dartStatusContextKey)
    const settings = useAppStore((s) => s.settings)
    const providerRuntimeContextKey = useAppStore((s) => getProviderRuntimeContextKey(s.settings))
    const dartConnected = current === getDartReadScope(settings).contextKey && dartStatus.connected
    const hook = useTaskPageDartCreation({
      providerRuntimeContextKey,
      taskSource: 'dart',
      dartConnected,
      dartUpdateRequired: false,
      dartConfig: cfg,
      dartFilters: { mine: false, status: null, dartboard: null, search: '' },
      dartStatus,
      setDartRefreshNonce: vi.fn(),
      noteDartTaskCreated: vi.fn(),
      openDartDetailPage: vi.fn()
    })
    const model: DartCreateDialogModel = { ...hook, dartConfig: cfg }
    latest = model
    return (
      <>
        <button type="button" data-dart-new-task onClick={model.openCreate}>
          New task
        </button>
        <TaskPageDartCreateDialog model={model} />
      </>
    )
  }
  return render(
    <TooltipProvider>
      <View />
    </TooltipProvider>
  )
}
const tick = () =>
  act(async () => {
    await Promise.resolve()
  })
type U = ReturnType<typeof userEvent.setup>
const newTask = (u: U) => u.click(screen.getByRole('button', { name: 'New task', hidden: true }))
async function openType(u: U, t: string) {
  await newTask(u)
  await waitFor(() => expect(screen.queryByText(/Checking Dart capabilities/)).toBeNull())
  await u.type(screen.getByLabelText('Title'), t)
}
async function send401(u: U, code = 'dart.unauthorized') {
  host.refusals.push({ ok: false, error: 'Private account token rejected', errorCode: code })
  await u.click(screen.getByRole('button', { name: 'Create task' }))
  await waitFor(() => expect(useAppStore.getState().dartStatus.viewer).toBeNull())
  await tick()
}
const lists = () =>
  host.requests
    .filter((r) => r.method === 'dart.listTasks')
    .map(
      (r) =>
        `${r.params.title}|${'dartboard' in r.params && typeof r.params.dartboard === 'string' ? r.params.dartboard : ''}`
    )
type HostParams = Parameters<FakeDartHost['handle']>[1]
const createdTaskId = (reply: object): string | null =>
  'ok' in reply &&
  reply.ok === true &&
  'task' in reply &&
  typeof reply.task === 'object' &&
  reply.task !== null &&
  'id' in reply.task &&
  typeof reply.task.id === 'string'
    ? reply.task.id
    : null
const lostOnce = () => {
  const orig = host.handle.bind(host)
  host.handle = async (m: string, p: HostParams) => {
    const r = await orig(m, p)
    const id = m === 'dart.createTask' ? createdTaskId(r) : null
    if (id) {
      host.tasks.delete(id)
      return { ok: false, error: 'Lost', outcome: 'unknown' }
    }
    return r
  }
}
const truncate = (when: (p: HostParams) => boolean) => {
  const orig = host.handle.bind(host)
  host.handle = async (m: string, p: HostParams) => {
    const r = await orig(m, p)
    return m === 'dart.listTasks' && when(p) && 'ok' in r && r.ok ? { ...r, totalCount: 500 } : r
  }
}
const failList = (when: (p: HostParams) => boolean) => {
  const orig = host.handle.bind(host)
  host.handle = async (m: string, p: HostParams) => {
    if (m === 'dart.listTasks' && when(p)) {
      return { ok: false, error: 'List down' }
    }
    return orig(m, p)
  }
}
async function twoAttempts(u: U, first: string, second: string) {
  lostOnce()
  await openType(u, first)
  await u.click(screen.getByRole('button', { name: 'Create task' }))
  await waitFor(() => expect(latest.canCreateAnyway).toBe(true))
  host.refusals.push({ ok: false, error: 'Fix', errorCode: 'dart.badRequest' })
  await act(async () => {
    await latest.createAnyway()
  })
  await tick()
  await u.clear(screen.getByLabelText('Title'))
  await u.type(screen.getByLabelText('Title'), second)
}

describe('dart create recovery attempts', () => {
  it('pStoredBoard: late config cannot move an uncertain create to another board', async () => {
    const u = userEvent.setup()
    renderDialog(null)
    await newTask(u)
    await tick()
    act(() => latest.setCreateDraft({ title: 'Late board' }))
    act(() => setCfg({ ...config, dartboards: ['A'] }))
    await tick()
    host.lostReplies.push({ ok: false, error: 'Lost', outcome: 'unknown' })
    await waitFor(() => expect(latest.createWritesV2Pending).toBe(false))
    await u.click(screen.getByRole('button', { name: 'Create task' }))
    await waitFor(() => expect(latest.createUnresolved).toBe(true))
    await tick()
    host.tasks.clear()
    await act(async () => {
      await latest.checkAgain()
    })
    act(() => setCfg({ ...config, dartboards: ['B'] }))
    await tick()
    await act(async () => {
      await latest.createAnyway()
    })
    const creates = host.requests.filter((r) => r.method === 'dart.createTask')
    expect(creates.every((c) => 'dartboard' in c.params && c.params.dartboard === 'A')).toBe(true)
  })
  it('pAllAttempts: three uncertain attempts are all searched', async () => {
    const u = userEvent.setup()
    renderDialog()
    await twoAttempts(u, 'X', 'Y')
    await act(async () => {
      await latest.checkAgain()
    })
    await waitFor(() => expect(latest.canCreateAnyway).toBe(true))
    await act(async () => {
      await latest.createAnyway()
    })
    await tick()
    await waitFor(() => expect(latest.canCreateAnyway).toBe(true))
    host.refusals.push({ ok: false, error: 'Fix', errorCode: 'dart.badRequest' })
    await act(async () => {
      await latest.createAnyway()
    })
    await tick()
    await u.clear(screen.getByLabelText('Title'))
    await u.type(screen.getByLabelText('Title'), 'Z')
    host.addTask(dartTaskFixture('landedXxxxxx', { title: 'X' }))
    await act(async () => {
      await latest.checkAgain()
    })
    expect(latest.createMatches.map((t) => t.title)).toContain('X')
    expect(latest.canCreateAnyway).toBe(false)
  })
  it('pBoardDedupe: same title on another board is searched', async () => {
    const u = userEvent.setup()
    renderDialog()
    lostOnce()
    await openType(u, 'Same')
    await u.click(screen.getByRole('button', { name: 'Create task' }))
    await waitFor(() => expect(latest.canCreateAnyway).toBe(true))
    host.refusals.push({ ok: false, error: 'Fix', errorCode: 'dart.badRequest' })
    await act(async () => {
      await latest.createAnyway()
    })
    await tick()
    act(() => latest.setCreateDraft({ dartboard: 'Example/Platform/Search' }))
    host.requests.length = 0
    await act(async () => {
      await latest.checkAgain()
    })
    expect(lists()).toEqual(['Same|Example/Platform', 'Same|Example/Platform/Search'])
  })
  it('pTruncExit: truncation offers None of these, and Create anyway only after it', async () => {
    const u = userEvent.setup()
    renderDialog()
    truncate(() => true)
    host.lostReplies.push({ ok: false, error: 'Lost', outcome: 'unknown' })
    await openType(u, 'Common title')
    await u.click(screen.getByRole('button', { name: 'Create task' }))
    await tick()
    expect(latest.createMatchesTruncated).toBe(true)
    expect(latest.canCreateAnyway).toBe(false)
    await u.click(await screen.findByRole('button', { name: 'None of these is mine' }))
    expect(latest.canCreateAnyway).toBe(true)
    expect(screen.getByRole('button', { name: 'Create anyway' })).toBeTruthy()
  })
  it('pTruncAggregate: truncation on an earlier attempt still requires dismissal', async () => {
    const u = userEvent.setup()
    renderDialog()
    await twoAttempts(u, 'First', 'Second')
    truncate((p) => p.title === 'First')
    await act(async () => {
      await latest.checkAgain()
    })
    expect(latest.createMatchesTruncated).toBe(true)
    expect(latest.canCreateAnyway).toBe(false)
  })
  it('pTruncWithError: truncation plus a failed search stays blocked, with no truncation exit', async () => {
    const u = userEvent.setup()
    renderDialog()
    await twoAttempts(u, 'First', 'Second')
    truncate((p) => p.title === 'First')
    failList((p) => p.title === 'Second')
    await act(async () => {
      await latest.checkAgain()
    })
    expect(latest.listChecked).toBe(false)
    expect(latest.createMatchesTruncated).toBe(false)
    expect(latest.canCreateAnyway).toBe(false)
    expect(screen.queryByRole('button', { name: 'None of these is mine' })).toBeNull()
  })
  it('pRefusedDropped: a host-refused attempt is not searched later', async () => {
    const u = userEvent.setup()
    renderDialog()
    await openType(u, 'Refused')
    host.refusals.push({ ok: false, error: 'Fix', errorCode: 'dart.badRequest' })
    await u.click(screen.getByRole('button', { name: 'Create task' }))
    await tick()
    await u.clear(screen.getByLabelText('Title'))
    await u.type(screen.getByLabelText('Title'), 'Sent')
    host.lostReplies.push({ ok: false, error: 'Lost', outcome: 'unknown' })
    host.requests.length = 0
    await u.click(screen.getByRole('button', { name: 'Dismiss' }))
    await u.click(screen.getByRole('button', { name: 'Create task' }))
    await tick()
    expect(lists()).toEqual(['Sent|Example/Platform'])
  })
  it('pRefusalKeepsEarlierEqual: refusing a resend keeps the earlier uncertain send searched', async () => {
    const u = userEvent.setup()
    renderDialog()
    await twoAttempts(u, 'X', 'Y')
    await act(async () => {
      await latest.checkAgain()
    })
    await waitFor(() => expect(latest.canCreateAnyway).toBe(true))
    await act(async () => {
      await latest.createAnyway()
    })
    await tick()
    await waitFor(() => expect(latest.canCreateAnyway).toBe(true))
    host.refusals.push({ ok: false, error: 'Fix', errorCode: 'dart.badRequest' })
    await act(async () => {
      await latest.createAnyway()
    })
    await tick()
    await u.clear(screen.getByLabelText('Title'))
    await u.type(screen.getByLabelText('Title'), 'X')
    await act(async () => {
      await latest.checkAgain()
    })
    await waitFor(() => expect(latest.canCreateAnyway).toBe(true))
    host.refusals.push({ ok: false, error: 'Fix', errorCode: 'dart.badRequest' })
    await act(async () => {
      await latest.createAnyway()
    })
    await tick()
    await u.clear(screen.getByLabelText('Title'))
    await u.type(screen.getByLabelText('Title'), 'Z')
    host.addTask(dartTaskFixture('landedXxxxxx', { title: 'X' }))
    await act(async () => {
      await latest.checkAgain()
    })
    expect(latest.createMatches.map((t) => t.title)).toContain('X')
    expect(latest.canCreateAnyway).toBe(false)
  })
  it('pRecordGate: a 401 landing after a reconnect confirmed the viewer is not recorded', async () => {
    const u = userEvent.setup()
    renderDialog()
    await openType(u, 'In flight')
    const release = host.hold('dart.createTask')
    host.refusals.push({ ok: false, error: 'Old', errorCode: 'dart.unauthorized' })
    await u.click(screen.getByRole('button', { name: 'Create task' }))
    await waitFor(() => expect(host.count('dart.createTask')).toBe(1))
    await act(async () => {
      await useAppStore.getState().connectDart({ apiToken: 'fresh' })
    })
    await act(async () => {
      release()
    })
    expect(useAppStore.getState().dartStatus.viewer?.id).toBe('user-a')
    act(() => switchTo(null, null))
    expect(latest.createTokenRejected).toBe(false)
  })
  it('pRecordOtherHost: a 401 landing while another host has a confirmed viewer stays on its host', async () => {
    const u = userEvent.setup()
    renderDialog()
    await openType(u, 'Other host')
    const release = host.hold('dart.createTask')
    host.refusals.push({ ok: false, error: 'Rejected', errorCode: 'dart.unauthorized' })
    await u.click(screen.getByRole('button', { name: 'Create task' }))
    await waitFor(() => expect(host.count('dart.createTask')).toBe(1))
    act(() => switchTo('host-2', A))
    await tick()
    await act(async () => {
      release()
    })
    expect(latest.createTokenRejected).toBe(false)
    act(() => switchTo(null, null))
    await tick()
    expect(latest.createTokenRejected).toBe(true)
  })
  it('pClearOwnHost: a confirmed viewer on host 2 keeps the host 1 rejection', async () => {
    const u = userEvent.setup()
    renderDialog()
    await openType(u, 'Host one')
    await send401(u)
    act(() => switchTo('host-2', A))
    await tick()
    expect(latest.createTokenRejected).toBe(false)
    act(() => switchTo(null, null))
    await tick()
    expect(latest.createTokenRejected).toBe(true)
  })
  it('pClearBothHosts: confirming host 2 clears only host 2 when both hold rejections', async () => {
    const u = userEvent.setup()
    renderDialog()
    await openType(u, 'Host one')
    await send401(u)
    const second = runtime.host('host-2')
    act(() => switchTo('host-2', A))
    await tick()
    await waitFor(() => expect(latest.createWritesV2Pending).toBe(false))
    second.refusals.push({ ok: false, error: 'Rejected', errorCode: 'dart.unauthorized' })
    act(() => latest.setCreateDraft({ title: 'Host two' }))
    await act(async () => {
      await latest.createTask({ title: 'Host two', dartboard: 'Example/Platform' })
    })
    await tick()
    expect(useAppStore.getState().dartStatus.viewer).toBeNull()
    expect(latest.createTokenRejected).toBe(true)
    act(() => switchTo('host-2', A))
    await tick()
    expect(latest.createTokenRejected).toBe(false)
    act(() => switchTo(null, null))
    await tick()
    expect(latest.createTokenRejected).toBe(true)
  })
  it('pTruncExitNoMatches: truncation with zero matches still offers None of these', async () => {
    const u = userEvent.setup()
    renderDialog()
    lostOnce()
    truncate(() => true)
    await openType(u, 'Common title')
    await u.click(screen.getByRole('button', { name: 'Create task' }))
    await tick()
    expect(latest.createMatches).toEqual([])
    expect(latest.createMatchesTruncated).toBe(true)
    expect(latest.canCreateAnyway).toBe(false)
    await u.click(await screen.findByRole('button', { name: 'None of these is mine' }))
    expect(latest.canCreateAnyway).toBe(true)
  })
  it('pTruncErrorAnyway: a failed search beside a truncated one never unlocks Create anyway', async () => {
    const u = userEvent.setup()
    renderDialog()
    await twoAttempts(u, 'First', 'Second')
    truncate((p) => p.title === 'First')
    failList((p) => p.title === 'Second')
    await act(async () => {
      await latest.checkAgain()
    })
    expect(latest.canCreateAnyway).toBe(false)
  })
  it('pTruncAggregateAnyway: an earlier truncated search never unlocks Create anyway undismissed', async () => {
    const u = userEvent.setup()
    renderDialog()
    await twoAttempts(u, 'First', 'Second')
    truncate((p) => p.title === 'First')
    await act(async () => {
      await latest.checkAgain()
    })
    expect(latest.canCreateAnyway).toBe(false)
  })
})
