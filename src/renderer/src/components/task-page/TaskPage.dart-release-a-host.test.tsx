// @vitest-environment happy-dom

import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DartTaskRelationships } from '../../../../shared/dart/dart-types'
import { useAppStore } from '@/store'
import {
  dartTaskFixture,
  type FakeDartHost
} from '@/store/slices/dart/dart-fake-runtime.test-support'
import {
  boardColumn,
  prepareBoardPageEnvironment,
  renderPage,
  switchToBoard
} from './dart-board-page.test-support'
import {
  addRemote,
  remoteCapabilities,
  SOURCE,
  TRANSPORTS,
  web
} from './dart-delivery-transports.test-support'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/components/PullRequestPage', () => ({ default: () => null }))
vi.mock('@/components/GitHubItemDialog', () => ({ default: () => null }))
vi.mock('./github/List', () => ({ TaskPageGitHubList: () => null }))
vi.mock('./jira/Content', () => ({ TaskPageJiraContent: () => null }))
vi.mock('./linear/Content', () => ({ TaskPageLinearContent: () => null }))

vi.mock('@/web/preload-api/web-runtime-calls', () => ({
  getRemoteRuntimeStatus: async () => ({ capabilities: web.capabilities }),
  callRuntimeEnvelope: async (method: string, params: Parameters<FakeDartHost['handle']>[1]) => ({
    ok: true,
    result: await web.host!.handle(method, params)
  })
}))
vi.mock('@/web/preload-api/web-runtime-session', () => ({
  requireActiveEnvironment: () => ({ id: 'web-env' }),
  assertActiveEnvironment: () => {}
}))

beforeEach(prepareBoardPageEnvironment)

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const HOLD_ID = 'holdTask0001'
const BLOCKER_ID = 'blockerOne01'
const EXTRA_ID = 'blockerTwo01'

function links(overrides: Partial<DartTaskRelationships> = {}): DartTaskRelationships {
  return {
    subtaskIds: [],
    blockerIds: [],
    blockingIds: [],
    duplicateIds: [],
    relatedIds: [],
    ...overrides
  }
}

function seedHoldTask(host: FakeDartHost, blockerIds: string[]): void {
  host.addTask(
    dartTaskFixture(BLOCKER_ID, { title: 'Blocker one', status: 'Doing', dartboard: 'Board A' })
  )
  host.addTask(
    dartTaskFixture(EXTRA_ID, { title: 'Blocker two', status: 'Doing', dartboard: 'Board A' })
  )
  host.addTask(
    dartTaskFixture(HOLD_ID, {
      title: 'Held task',
      status: 'On hold',
      dartboard: 'Board A',
      relationships: links({ blockerIds })
    })
  )
}

function holdBlockers(host: FakeDartHost): readonly string[] | undefined {
  return host.tasks.get(HOLD_ID)?.relationships?.blockerIds
}

function requestedKeys(host: FakeDartHost): Set<string> {
  return new Set(host.requests.flatMap(({ params }) => Object.keys(params ?? {})))
}

function switchHost(environmentId: string): void {
  act(() => {
    useAppStore.setState({
      settings: { ...useAppStore.getState().settings!, activeRuntimeEnvironmentId: environmentId }
    })
  })
}

async function addBlockerFromDetail(title: string): Promise<void> {
  const user = userEvent.setup()
  fireEvent.click(await screen.findByRole('heading', { name: 'Held task' }))
  const sheet = await screen.findByRole('dialog')
  await user.click(await within(sheet).findByRole('button', { name: 'Add blocker' }))
  await user.type(await screen.findByPlaceholderText('Search tasks'), title)
  await user.click(await screen.findByRole('option', { name: new RegExp(title) }))
  await waitFor(() => expect(screen.queryByPlaceholderText('Search tasks')).toBeNull())
  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
}

describe.each(TRANSPORTS)('a host without dart.relationships.v1 over the $name', (transport) => {
  function openReleaseAHost(): FakeDartHost {
    const host = transport.open()
    // A release A host never sends `parentId`; the client must still not nest on it.
    host.addTask(
      dartTaskFixture('childTask001', {
        title: 'Child task',
        status: 'Doing',
        dartboard: 'Board A',
        parentId: SOURCE.id
      })
    )
    return host
  }

  it('shows every task as its own flat list row and board card, with no blocker or subtask UI', async () => {
    const host = openReleaseAHost()
    renderPage()

    await screen.findByRole('heading', { name: 'Child task' })
    expect(screen.getByRole('heading', { name: SOURCE.title })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /expand|subtasks/i })).toBeNull()
    expect(screen.queryByText(/subtasks? (is|are) under/)).toBeNull()

    await switchToBoard()
    expect(boardColumn('To-do').querySelectorAll('[data-dart-card-id]')).toHaveLength(1)
    expect(boardColumn('Doing').textContent).toContain('Child task')
    expect(screen.queryByText('Blockers not checked')).toBeNull()
    expect(screen.queryByLabelText(/^Blocked by/)).toBeNull()

    expect(requestedKeys(host)).not.toContain('parentId')
    expect(requestedKeys(host)).not.toContain('ids')
    expect(host.count('dart.updateTaskBlockers')).toBe(0)
  })

  it('opens the detail without Relationships or Subtasks sections and sends only release A reads', async () => {
    const host = openReleaseAHost()
    renderPage()

    fireEvent.click(await screen.findByRole('heading', { name: SOURCE.title }))
    const sheet = await screen.findByRole('dialog')
    await within(sheet).findByRole('combobox', { name: 'Status' })

    expect(within(sheet).queryByText('Relationships')).toBeNull()
    expect(within(sheet).queryByText('Blocked by')).toBeNull()
    expect(within(sheet).queryByRole('button', { name: 'Add blocker' })).toBeNull()
    expect(within(sheet).queryByText('Subtasks')).toBeNull()
    expect(host.requests.some(({ method }) => method === 'dart.getTask')).toBe(true)
    expect(requestedKeys(host)).not.toContain('parentId')
    expect(requestedKeys(host)).not.toContain('ids')
    expect(host.count('dart.updateTaskBlockers')).toBe(0)
  })
})

describe('blocker writes keep to their host and account', () => {
  it.each(TRANSPORTS)(
    'adds a blocker on the host over the $name and shows it after a re-read',
    async (transport) => {
      const host = transport.open({ relationships: true })
      seedHoldTask(host, [BLOCKER_ID])
      renderPage()
      expect(await screen.findByLabelText('Blocked by 1')).toBeTruthy()

      await addBlockerFromDetail('Blocker two')

      await waitFor(() => expect(holdBlockers(host)).toEqual([BLOCKER_ID, EXTRA_ID]))
      expect(host.requestsOf('dart.updateTaskBlockers')).toEqual([
        { taskId: HOLD_ID, blockerIds: [BLOCKER_ID, EXTRA_ID] }
      ])
      expect(await screen.findByLabelText('Blocked by 2')).toBeTruthy()
    }
  )

  it('keeps a blocker written on host A and its card marker off host B', async () => {
    const a = TRANSPORTS[0].open({ relationships: true })
    const b = addRemote({ relationships: true })
    const [environmentA, environmentB] = [...remoteCapabilities.keys()]
    seedHoldTask(a, [BLOCKER_ID])
    seedHoldTask(b.host, [BLOCKER_ID])
    renderPage()
    expect(await screen.findByLabelText('Blocked by 1')).toBeTruthy()
    await addBlockerFromDetail('Blocker two')
    await waitFor(() => expect(holdBlockers(a)).toEqual([BLOCKER_ID, EXTRA_ID]))
    expect(await screen.findByLabelText('Blocked by 2')).toBeTruthy()

    const releaseB = b.host.hold('dart.getTask')
    switchHost(environmentB)
    await screen.findByRole('heading', { name: 'Held task' })

    expect(screen.queryByLabelText('Blocked by 2')).toBeNull()
    releaseB()
    expect(await screen.findByLabelText('Blocked by 1')).toBeTruthy()
    expect(holdBlockers(b.host)).toEqual([BLOCKER_ID])
    expect(b.host.count('dart.updateTaskBlockers')).toBe(0)

    switchHost(environmentA)
    expect(await screen.findByLabelText('Blocked by 2')).toBeTruthy()
    expect(holdBlockers(a)).toEqual([BLOCKER_ID, EXTRA_ID])
  })

  it("does not show one account's blocker marker to another account on the same host", async () => {
    const host = TRANSPORTS[0].open({ relationships: true })
    seedHoldTask(host, [BLOCKER_ID])
    renderPage()
    expect(await screen.findByLabelText('Blocked by 1')).toBeTruthy()
    await addBlockerFromDetail('Blocker two')
    expect(await screen.findByLabelText('Blocked by 2')).toBeTruthy()

    const viewer = { id: 'user-b', name: 'Bo Example' }
    host.connection = { connected: true, viewer }
    host.tasks.set(HOLD_ID, {
      ...host.tasks.get(HOLD_ID)!,
      relationships: links({ blockerIds: [BLOCKER_ID] })
    })
    const release = host.hold('dart.getTask')
    act(() => {
      useAppStore.setState({ dartStatus: { connected: true, viewer } })
    })

    await screen.findByRole('heading', { name: 'Held task' })
    expect(screen.queryByLabelText('Blocked by 2')).toBeNull()
    release()
    expect(await screen.findByLabelText('Blocked by 1')).toBeTruthy()
    expect(host.requestsOf('dart.updateTaskBlockers')).toHaveLength(1)
  })
})
