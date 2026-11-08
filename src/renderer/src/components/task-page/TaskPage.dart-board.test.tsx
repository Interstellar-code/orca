// @vitest-environment happy-dom

import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  dartTaskFixture,
  type FakeDartHost
} from '@/store/slices/dart/dart-fake-runtime.test-support'
import {
  boardColumn,
  prepareBoardPageEnvironment,
  renderPage,
  seedOpenTasks,
  switchToBoard,
  wireWebSavedViews
} from './dart-board-page.test-support'
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
  callRuntimeEnvelope: async (method: string, params: Parameters<FakeDartHost['handle']>[1]) =>
    web.methodNotFound
      ? { ok: false, error: { code: 'method_not_found', message: `Unknown method ${method}` } }
      : { ok: true, result: await web.host!.handle(method, params) }
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

describe('delivery and races', () => {
  const desktop = TRANSPORTS.find((transport) => transport.name === 'desktop IPC')!
  const REFUSED = {
    ok: false,
    error: 'Dart refused the move.',
    errorCode: 'dart.updateFailed',
    outcome: 'notApplied'
  } as const

  function transfer(): Pick<DataTransfer, 'setData' | 'getData' | 'types'> & {
    effectAllowed: string
    dropEffect: string
  } {
    const data = new Map<string, string>()
    return {
      effectAllowed: 'uninitialized',
      dropEffect: 'none',
      setData: (type: string, value: string) => {
        data.set(type, value)
      },
      getData: (type: string) => data.get(type) ?? '',
      get types() {
        return [...data.keys()]
      }
    }
  }

  function cardIds(status: string): string[] {
    return Array.from(boardColumn(status).querySelectorAll('[data-dart-card-id]')).map(
      (card) => card.getAttribute('data-dart-card-id') ?? ''
    )
  }

  // Real drag events with the payload the card itself writes, as a browser would send them.
  function drag(taskId: string, toStatus: string): void {
    const card = document.querySelector(`[data-dart-card-id="${taskId}"]`)
    if (!card) {
      throw new Error(`No card for ${taskId}`)
    }
    const dataTransfer = transfer()
    fireEvent.dragStart(card, { dataTransfer })
    fireEvent.dragOver(boardColumn(toStatus), { dataTransfer })
    fireEvent.drop(boardColumn(toStatus), { dataTransfer })
  }

  async function refresh(): Promise<void> {
    const button = await screen.findByRole('button', { name: 'Refresh Dart tasks' })
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false))
    fireEvent.click(button)
  }

  async function settledRefresh(host: FakeDartHost): Promise<void> {
    const before = host.count('dart.listTasks')
    await refresh()
    await waitFor(() => expect(host.count('dart.listTasks')).toBeGreaterThan(before))
    const button = screen.getByRole('button', { name: 'Refresh Dart tasks' })
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false))
  }

  // Empty columns are hidden by default and a drop needs the target column on screen.
  async function openBoard({ emptyColumns = true } = {}): Promise<void> {
    renderPage()
    await switchToBoard()
    await waitFor(() => expect(cardIds('To-do')).toContain(SOURCE.id))
    if (emptyColumns) {
      fireEvent.click(screen.getByRole('switch', { name: 'Show empty columns' }))
      await waitFor(() => expect(boardColumn('Doing')).toBeTruthy())
    }
  }

  async function savedViewsTrigger(name: string): Promise<ReturnType<typeof userEvent.setup>> {
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name }))
    return user
  }

  async function saveView(name: string, from: string, label: string): Promise<void> {
    const user = await savedViewsTrigger(from)
    await user.click(await screen.findByRole('button', { name: label }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), name)
    await user.click(within(dialog).getByRole('button', { name: 'Save view' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  }

  describe.each(TRANSPORTS)('over the $name', (transport) => {
    it('moves a dragged card to the other column on the host and shows it after a re-read', async () => {
      const host = transport.open()
      await openBoard()
      const id = SOURCE.id

      drag(id, 'Doing')

      await waitFor(() => expect(host.tasks.get(id)?.status).toBe('Doing'))
      await settledRefresh(host)
      await waitFor(() => expect(cardIds('Doing')).toEqual([id]))
      expect(cardIds('To-do')).toEqual([])
    })

    it('creates, selects, renames and deletes saved views on the host and restores an applied view', async () => {
      const host = transport.open()
      await wireWebSavedViews(transport)
      await openBoard({ emptyColumns: false })
      const stored = (): typeof host.savedViewState => host.savedViewState

      await saveView('Triage', 'Saved views', 'Save view')

      await waitFor(() => expect(stored().views).toHaveLength(1))
      const [triage] = stored().views
      expect(triage).toMatchObject({ name: 'Triage', layout: 'board' })
      expect(triage.filters.mine).toBe(true)
      expect(stored().activeViewId).toBe(triage.id)

      fireEvent.click(screen.getByRole('button', { name: 'All tasks' }))
      fireEvent.click(screen.getByRole('radio', { name: 'List' }))
      await waitFor(() => expect(document.querySelector('[data-dart-board]')).toBeNull())
      await saveView('Everything', 'Triage', 'Save as new')

      await waitFor(() => expect(stored().views).toHaveLength(2))
      const everything = stored().views.find((view) => view.name === 'Everything')!
      expect(everything).toMatchObject({ layout: 'list' })
      expect(everything.filters.mine).toBe(false)
      expect(stored().activeViewId).toBe(everything.id)

      const user = await savedViewsTrigger('Everything')
      await user.click(await screen.findByRole('option', { name: /Triage/ }))

      await waitFor(() => expect(stored().activeViewId).toBe(triage.id))
      await waitFor(() => expect(document.querySelector('[data-dart-board]')).not.toBeNull())
      expect(
        screen.getByRole('button', { name: 'Assigned to me' }).getAttribute('aria-pressed')
      ).toBe('true')

      const renamer = await savedViewsTrigger('Triage')
      await renamer.click(await screen.findByRole('button', { name: 'Edit Everything' }))
      const dialog = await screen.findByRole('dialog')
      await renamer.clear(within(dialog).getByRole('textbox', { name: 'Name' }))
      await renamer.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'All work')
      await renamer.click(within(dialog).getByRole('button', { name: 'Rename' }))

      await waitFor(() =>
        expect(
          stored()
            .views.map((view) => view.name)
            .sort()
        ).toEqual(['All work', 'Triage'])
      )

      const remover = await savedViewsTrigger('Triage')
      await remover.click(await screen.findByRole('button', { name: 'Edit All work' }))
      await remover.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete view' })
      )

      await waitFor(() => expect(stored().views.map((view) => view.name)).toEqual(['Triage']))
      expect(stored().activeViewId).toBe(triage.id)
    })

    it('keeps the card in the dropped column when a refresh resolves after the drag settles', async () => {
      const host = transport.open()
      await openBoard()
      const id = SOURCE.id
      const release = host.hold('dart.listTasks')
      const before = host.count('dart.listTasks')
      await refresh()
      await waitFor(() => expect(host.count('dart.listTasks')).toBeGreaterThan(before))

      drag(id, 'Doing')
      await waitFor(() => expect(host.tasks.get(id)?.status).toBe('Doing'))
      await act(async () => release())

      await waitFor(() => expect(cardIds('Doing')).toEqual([id]))
      const button = screen.getByRole('button', { name: 'Refresh Dart tasks' })
      await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false))
      expect(cardIds('Doing')).toEqual([id])
      expect(cardIds('To-do')).toEqual([])
    })

    it('keeps the card in the dropped column through a refresh while the write is pending, then keeps it once the write lands', async () => {
      const host = transport.open()
      await openBoard()
      const id = SOURCE.id
      const release = host.hold('dart.updateTask')

      drag(id, 'Doing')
      await waitFor(() => expect(host.count('dart.updateTask')).toBe(1))
      await settledRefresh(host)

      expect(host.tasks.get(id)?.status).toBe('To-do')
      expect(cardIds('Doing')).toEqual([id])
      await act(async () => release())
      await waitFor(() => expect(host.tasks.get(id)?.status).toBe('Doing'))
      await settledRefresh(host)
      await waitFor(() => expect(cardIds('Doing')).toEqual([id]))
      expect(cardIds('To-do')).toEqual([])
    })

    it('returns the card to its column when the write that a refresh overtook is refused', async () => {
      const host = transport.open()
      await openBoard()
      const id = SOURCE.id
      host.refusals.push(REFUSED)
      const release = host.hold('dart.updateTask')

      drag(id, 'Doing')
      await waitFor(() => expect(host.count('dart.updateTask')).toBe(1))
      await settledRefresh(host)
      expect(cardIds('Doing')).toEqual([id])
      await act(async () => release())

      await waitFor(() => expect(cardIds('To-do')).toEqual([id]))
      await settledRefresh(host)
      expect(host.tasks.get(id)?.status).toBe('To-do')
      expect(cardIds('Doing')).toEqual([])
      expect(cardIds('To-do')).toEqual([id])
    })

    it('shows a task created with the board open after the follow-up refresh', async () => {
      const host = transport.open()
      await openBoard()
      const user = userEvent.setup()

      await user.click(screen.getByRole('button', { name: 'New task' }))
      await user.type(await screen.findByLabelText('Title'), 'Ship the board')
      const create = await screen.findByRole('button', { name: 'Create task' })
      await waitFor(() => expect(create.hasAttribute('disabled')).toBe(false))
      await user.click(create)

      await waitFor(() => expect(host.count('dart.createTask')).toBe(1))
      const created = Array.from(host.tasks.values()).find(
        (task) => task.title === 'Ship the board'
      )
      expect(created).toBeDefined()
      await user.click(await screen.findByRole('button', { name: 'Close Dart task preview' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      await settledRefresh(host)

      await waitFor(() => expect(cardIds('To-do')).toContain(created!.id))
    })
  })

  it('ends with both drops in place when two drags settle during a five-request refresh and the second re-read publishes', async () => {
    const host = desktop.open()
    seedOpenTasks(host, 'bulk', 999, 'To-do')
    await openBoard()
    // 1,000 cards render slowly under happy-dom, so the default 1 s wait is too short.
    await waitFor(() => expect(cardIds('To-do')).toHaveLength(1000), { timeout: 30_000 })
    const first = SOURCE.id
    const second = 'bulk001'
    const before = host.count('dart.listTasks')
    const releaseFirst = host.hold('dart.listTasks')
    const gate = Promise.withResolvers<void>()
    const handle = host.handle.bind(host)
    // The re-read's first page is the 6th list request after the refresh began (4 open pages and 1 finished page).
    host.handle = async (method, params) => {
      const reply = handle(method, params)
      if (method === 'dart.listTasks' && host.count('dart.listTasks') === before + 6) {
        await gate.promise
      }
      return reply
    }

    await refresh()
    await waitFor(() => expect(host.count('dart.listTasks')).toBe(before + 1))
    drag(first, 'Doing')
    await waitFor(() => expect(host.tasks.get(first)?.status).toBe('Doing'))
    await act(async () => releaseFirst())
    await waitFor(() => expect(host.count('dart.listTasks')).toBe(before + 6))
    drag(second, 'Doing')
    await waitFor(() => expect(host.tasks.get(second)?.status).toBe('Doing'))
    await act(async () => gate.resolve())

    // The read and its two re-reads are five requests each.
    // 1,000 cards render slowly under happy-dom, so the default 1 s wait is too short.
    await waitFor(() => expect(host.count('dart.listTasks')).toBe(before + 15), { timeout: 30_000 })
    const button = screen.getByRole('button', { name: 'Refresh Dart tasks' })
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false))
    const onHost = (status: string): string[] =>
      Array.from(host.tasks.values())
        .filter((task) => task.status === status)
        .map((task) => task.id)
    expect(cardIds('Doing').sort()).toEqual(onHost('Doing').sort())
    expect(cardIds('To-do').sort()).toEqual(onHost('To-do').sort())
    expect(cardIds('Doing').sort()).toEqual([second, first].sort())
  }, 90_000)

  it('drops a stale "Show 50 more finished" reply after the server filter changes and restarts the offset', async () => {
    const host = desktop.open()
    const addDone = (prefix: string, assignee: string, firstMinute: number): void => {
      for (let index = 0; index < 60; index += 1) {
        host.addTask(
          dartTaskFixture(`${prefix}${String(index).padStart(3, '0')}`, {
            title: `${prefix} ${index}`,
            status: 'Done',
            assignee,
            completedAt: new Date(
              Date.UTC(2026, 0, 1) + (firstMinute + index) * 60_000
            ).toISOString()
          })
        )
      }
    }
    addDone('mineDone', VIEWER.name, 0)
    addDone('samDone', 'Sam Example', 100)
    renderPage()
    await switchToBoard()
    const more = await screen.findByRole('button', { name: 'Show 50 more finished' })
    await waitFor(() => expect(cardIds('Done')).toHaveLength(50))
    const before = host.count('dart.listTasks')
    const release = host.hold('dart.listTasks')

    fireEvent.click(more)
    await waitFor(() => expect(host.count('dart.listTasks')).toBe(before + 1))
    fireEvent.click(screen.getByRole('button', { name: 'All tasks' }))
    await waitFor(() => expect(cardIds('Done').every((id) => id.startsWith('samDone'))).toBe(true))
    await act(async () => release())

    expect(cardIds('Done')).toHaveLength(50)
    expect(cardIds('Done').every((id) => id.startsWith('samDone'))).toBe(true)
    fireEvent.click(await screen.findByRole('button', { name: 'Show 50 more finished' }))
    await waitFor(() => expect(cardIds('Done')).toHaveLength(100))
    expect(new Set(cardIds('Done')).size).toBe(100)
    const request = host.requests.findLast(({ method }) => method === 'dart.listTasks')
    expect(request?.params).toMatchObject({ isCompleted: true, offset: 50 })
    expect(request?.params.assigneeId).toBeUndefined()
  })
})
