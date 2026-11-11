// @vitest-environment happy-dom

import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  dartTaskFixture,
  type FakeDartHost
} from '@/store/slices/dart/dart-fake-runtime.test-support'
import { relationshipsFixture } from '@/store/slices/dart/dart-fake-relationships.test-support'
import { prepareBoardPageEnvironment, renderPage } from './dart-board-page.test-support'
import { SOURCE, TRANSPORTS, VIEWER, web } from './dart-delivery-transports.test-support'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/components/PullRequestPage', () => ({ default: () => null }))
vi.mock('@/components/GitHubItemDialog', () => ({ default: () => null }))
vi.mock('./github/List', () => ({ TaskPageGitHubList: () => null }))
vi.mock('./jira/Content', () => ({ TaskPageJiraContent: () => null }))
vi.mock('./linear/Content', () => ({ TaskPageLinearContent: () => null }))

vi.mock('@/web/preload-api/web-runtime-calls', () => ({
  getRemoteRuntimeStatus: async () => ({ capabilities: web.capabilities }),
  callRuntimeResult: async (method: string, params: Parameters<FakeDartHost['handle']>[1]) =>
    web.host!.handle(method, params),
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

const desktop = TRANSPORTS.find((transport) => transport.name === 'desktop IPC')!
const ALPHA = 'blockerAlph1'
const BETA = 'blockerBeta2'

function seedTask(host: FakeDartHost, id: string, title: string, extra = {}): void {
  host.addTask(
    dartTaskFixture(id, {
      title,
      status: 'To-do',
      dartboard: 'Board A',
      assignee: VIEWER.name,
      ...extra
    })
  )
}

function seedBlockerTasks(host: FakeDartHost, blockerIds: string[] = []): void {
  host.addTask({ ...SOURCE, relationships: relationshipsFixture({ blockerIds }) })
  seedTask(host, ALPHA, 'Blocker alpha', { relationships: relationshipsFixture() })
  seedTask(host, BETA, 'Blocker beta', { relationships: relationshipsFixture() })
}

function blockersOnHost(host: FakeDartHost): string[] | undefined {
  return host.tasks.get(SOURCE.id)?.relationships?.blockerIds
}

async function settledRefresh(host: FakeDartHost): Promise<void> {
  const before = host.count('dart.listTasks')
  const button = await screen.findByRole('button', { name: 'Refresh Dart tasks' })
  await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false))
  fireEvent.click(button)
  await waitFor(() => expect(host.count('dart.listTasks')).toBeGreaterThan(before))
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Refresh Dart tasks' }).hasAttribute('disabled')
    ).toBe(false)
  )
}

async function openDetail(title = SOURCE.title): Promise<HTMLElement> {
  fireEvent.click(await screen.findByRole('heading', { name: title }))
  const sheet = await screen.findByRole('dialog')
  await within(sheet).findByRole('combobox', { name: 'Status' })
  return sheet
}

async function closeDetail(): Promise<void> {
  await userEvent.setup().click(screen.getByRole('button', { name: 'Close Dart task preview' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
}

async function searchBlockers(sheet: HTMLElement, text: string): Promise<void> {
  fireEvent.click(await within(sheet).findByRole('button', { name: 'Add blocker' }))
  fireEvent.change(await screen.findByPlaceholderText('Search tasks'), {
    target: { value: text }
  })
}

async function addBlocker(sheet: HTMLElement, title: string): Promise<void> {
  await searchBlockers(sheet, title)
  fireEvent.click(await screen.findByRole('option', { name: new RegExp(title) }))
}

describe.each(TRANSPORTS)('blockers in the detail over the $name', (transport) => {
  it('adds a blocker on the host and removes it again, each shown after a re-read and a reopen', async () => {
    const host = transport.open({ relationships: true })
    seedBlockerTasks(host)
    renderPage()
    let sheet = await openDetail()
    await within(sheet).findByText('No blockers')

    await addBlocker(sheet, 'Blocker alpha')

    await waitFor(() => expect(blockersOnHost(host)).toEqual([ALPHA]))
    expect(host.dartCalls).toEqual([`GET /tasks/${SOURCE.id}`, `PUT /tasks/${SOURCE.id}`])
    await closeDetail()
    await settledRefresh(host)
    sheet = await openDetail()
    const remove = await within(sheet).findByRole('button', {
      name: 'Remove blocker Blocker alpha'
    })

    fireEvent.click(remove)

    await waitFor(() => expect(blockersOnHost(host)).toEqual([]))
    await closeDetail()
    await settledRefresh(host)
    sheet = await openDetail()
    await within(sheet).findByText('No blockers')
    expect(within(sheet).queryByText('Blocker alpha')).toBeNull()
  })
})

describe('blocker races over the desktop IPC', () => {
  it('drops a search reply that a newer search overtook', async () => {
    const host = desktop.open({ relationships: true })
    seedBlockerTasks(host)
    renderPage()
    const sheet = await openDetail()
    const releaseAlpha = host.hold('dart.listTasks')
    const before = host.count('dart.listTasks')

    await searchBlockers(sheet, 'alpha')
    await waitFor(() => expect(host.count('dart.listTasks')).toBe(before + 1))
    fireEvent.change(screen.getByPlaceholderText('Search tasks'), {
      target: { value: 'beta' }
    })
    await waitFor(() => expect(host.count('dart.listTasks')).toBe(before + 2))
    await screen.findByRole('option', { name: /Blocker beta/ })
    await act(async () => releaseAlpha())

    await waitFor(() => expect(screen.queryByRole('status', { name: 'Searching' })).toBeNull())
    expect(screen.queryByRole('option', { name: /Blocker alpha/ })).toBeNull()
    expect(screen.getByRole('option', { name: /Blocker beta/ })).toBeTruthy()
    expect(host.requestsOf('dart.listTasks').slice(before)).toEqual([
      expect.objectContaining({ title: 'alpha' }),
      expect.objectContaining({ title: 'beta' })
    ])
  })

  it('keeps both a status write and a blocker write on one task when they overlap', async () => {
    const host = desktop.open({ relationships: true })
    seedBlockerTasks(host)
    renderPage()
    const sheet = await openDetail()
    const releaseStatus = host.hold('dart.updateTask')
    const user = userEvent.setup()

    await user.click(within(sheet).getByRole('combobox', { name: 'Status' }))
    await user.click(await screen.findByRole('option', { name: 'Doing' }))
    await waitFor(() => expect(host.count('dart.updateTask')).toBe(1))
    await addBlocker(sheet, 'Blocker alpha')
    await act(async () => releaseStatus())

    await waitFor(() => expect(host.tasks.get(SOURCE.id)?.status).toBe('Doing'))
    await waitFor(() => expect(blockersOnHost(host)).toEqual([ALPHA]))
    await closeDetail()
    await settledRefresh(host)
    const reopened = await openDetail()
    expect(within(reopened).getByRole('combobox', { name: 'Status' }).textContent).toContain(
      'Doing'
    )
    await within(reopened).findByRole('button', { name: 'Remove blocker Blocker alpha' })
    expect(host.tasks.get(SOURCE.id)?.status).toBe('Doing')
    expect(blockersOnHost(host)).toEqual([ALPHA])
  })
})

describe('nested subtasks over the desktop IPC', () => {
  const PARENT = 'parentEpic01'

  function seedHierarchy(host: FakeDartHost): void {
    seedTask(host, PARENT, 'Parent epic', {
      relationships: relationshipsFixture({ subtaskIds: ['childAlpha01', 'childBeta002'] })
    })
    seedTask(host, 'childAlpha01', 'Child alpha', { parentId: PARENT })
    seedTask(host, 'childBeta002', 'Child beta', { parentId: PARENT })
  }

  const headings = (): string[] =>
    Array.from(document.querySelectorAll('h3'), (heading) => heading.textContent ?? '')

  it('lists subtasks only under their parent after expand, and flat when a search matches a subtask title', async () => {
    const host = desktop.open({ relationships: true })
    seedHierarchy(host)
    renderPage()
    await screen.findByRole('heading', { name: 'Parent epic' })
    expect(headings()).not.toContain('Child alpha')

    fireEvent.click(screen.getByRole('button', { name: 'Expand subtasks of Parent epic' }))

    await waitFor(() =>
      expect(headings()).toEqual(expect.arrayContaining(['Child alpha', 'Child beta']))
    )
    expect(host.requestsOf('dart.listTasks')).toContainEqual(
      expect.objectContaining({ parentId: PARENT })
    )
    expect(screen.getByRole('button', { name: 'Collapse subtasks of Parent epic' })).toBeTruthy()

    const search = screen.getByRole('textbox', { name: 'Search' })
    fireEvent.change(search, { target: { value: 'Child alpha' } })
    fireEvent.keyDown(search, { key: 'Enter' })

    await waitFor(() => expect(headings()).toEqual(['Child alpha']))
    expect(screen.queryByRole('button', { name: /subtasks of/ })).toBeNull()
    await waitFor(() =>
      expect(host.requestsOf('dart.listTasks').at(-1)).toMatchObject({ title: 'Child alpha' })
    )
  })
})

describe('on-hold relationship reads over the desktop IPC', () => {
  const HOLD_COUNT = 45
  const holdId = (index: number): string => `hold${String(index).padStart(8, '0')}`
  const isHoldRead = (params: { taskId?: string }): boolean =>
    params.taskId?.startsWith('hold') === true
  const holdReads = (host: FakeDartHost): string[] =>
    host
      .requestsOf('dart.getTask')
      .filter(isHoldRead)
      .map((params) => params.taskId as string)

  it('reads the first 20 on-hold tasks per publication and the next 20 on Check, showing the rest as not checked', async () => {
    const host = desktop.open({ relationships: true })
    for (let index = 0; index < HOLD_COUNT; index += 1) {
      seedTask(host, holdId(index), `On hold ${index}`, {
        status: 'On hold',
        relationships: relationshipsFixture({ blockerIds: [ALPHA] })
      })
    }
    renderPage()

    expect(await screen.findByText(/25 on-hold tasks not checked/)).toBeTruthy()
    const first = holdReads(host)
    expect(new Set(first).size).toBe(20)
    expect(screen.getAllByRole('img', { name: 'Blocked by 1' })).toHaveLength(20)
    expect(screen.getAllByText('Blockers not checked')).toHaveLength(25)

    fireEvent.click(screen.getByRole('button', { name: 'Check' }))

    await waitFor(() => expect(screen.getByText(/5 on-hold tasks not checked/)).toBeTruthy())
    const second = holdReads(host).slice(20)
    expect(second).toHaveLength(20)
    expect(second.some((id) => first.includes(id))).toBe(false)
    expect(screen.getAllByRole('img', { name: 'Blocked by 1' })).toHaveLength(40)
    expect(screen.getAllByText('Blockers not checked')).toHaveLength(5)

    fireEvent.click(screen.getByRole('button', { name: 'Check' }))

    await waitFor(() => expect(screen.queryByText(/on-hold tasks? not checked/)).toBeNull())
    expect(screen.getAllByRole('img', { name: 'Blocked by 1' })).toHaveLength(HOLD_COUNT)
    expect(new Set(holdReads(host)).size).toBe(HOLD_COUNT)
  })
})
