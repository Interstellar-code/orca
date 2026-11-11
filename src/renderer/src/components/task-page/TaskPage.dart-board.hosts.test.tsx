// @vitest-environment happy-dom

import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import {
  dartTaskFixture,
  type FakeDartHost
} from '@/store/slices/dart/dart-fake-runtime.test-support'
import {
  boardColumn,
  prepareBoardPageEnvironment,
  renderPage,
  switchToBoard,
  wireWebSavedViews
} from './dart-board-page.test-support'
import {
  addRemote,
  NETWORK_TRANSPORTS,
  remoteCapabilities,
  SOURCE,
  TRANSPORTS,
  VIEWER,
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

describe('hosts and config', () => {
  const desktop = TRANSPORTS.find((transport) => transport.name === 'desktop IPC')!
  const UNKNOWN = {
    ok: false,
    error: 'Failed to update Dart task.',
    errorCode: 'dart.updateFailed',
    outcome: 'unknown'
  } as const
  const BOARD_TOOLTIP = 'Update the remote Orca server to use the board'
  const LINKED_TOOLTIP = 'Turn off linked tasks to use the board'

  function cardTitles(status: string): string[] {
    return Array.from(
      boardColumn(status).querySelectorAll('[data-dart-card-id]'),
      (card) => card.querySelector('span')?.textContent ?? ''
    )
  }

  function listReads(host: FakeDartHost): Record<string, unknown>[] {
    return host.requests.filter(({ method }) => method === 'dart.listTasks').map((r) => r.params)
  }

  function serveConfig(host: FakeDartHost, config: { statuses: string[]; tags: string[] }): void {
    const handle = host.handle.bind(host)
    host.handle = async (method, params) => {
      if (method !== 'dart.config') {
        return handle(method, params)
      }
      host.requests.push({ method, params })
      return {
        ok: true,
        config: {
          dartboards: ['Board A', 'Board B'],
          statuses: config.statuses,
          types: [],
          tags: config.tags,
          priorities: ['High', 'Medium', 'Low'],
          sizes: ['1', '3', '5'],
          assignees: [VIEWER.name]
        }
      }
    }
  }

  async function moveCard(title: string, status: string): Promise<void> {
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: `Move “${title}” to…` }))
    await user.click(await screen.findByRole('menuitemcheckbox', { name: status }))
  }

  async function showTooltip(text: string): Promise<void> {
    const radio = await screen.findByRole('radio', { name: 'Board' })
    const trigger = radio.closest('span[tabindex="0"]')
    if (!(trigger instanceof HTMLElement)) {
      throw new Error('The disabled switch has no tooltip trigger')
    }
    act(() => trigger.focus())
    expect((await screen.findAllByText(text)).length).toBeGreaterThan(0)
  }

  function seedFolderWorkspace(): void {
    const workspace = {
      id: 'folder-repo::/home/alex/notes',
      repoId: 'folder-repo',
      path: '/home/alex/notes',
      displayName: 'Notes folder',
      branch: '',
      head: '',
      isBare: false,
      isMainWorktree: true,
      isArchived: false,
      isUnread: false,
      isPinned: false,
      sortOrder: 0,
      lastActivityAt: 1,
      comment: '',
      linkedIssue: null,
      linkedPR: null,
      linkedLinearIssue: null,
      linkedItems: [
        {
          provider: 'dart' as const,
          type: 'issue' as const,
          number: 0,
          identifier: SOURCE.id,
          url: SOURCE.htmlUrl,
          title: SOURCE.title
        }
      ]
    }
    useAppStore.setState({
      repos: [
        {
          id: 'folder-repo',
          path: '/home/alex/notes',
          displayName: 'Notes folder',
          badgeColor: '#888',
          addedAt: 1,
          kind: 'folder'
        }
      ],
      worktreesByRepo: { 'folder-repo': [workspace] }
    })
  }

  async function openLinkedTasks(): Promise<void> {
    await screen.findByRole('heading', { name: SOURCE.title })
    fireEvent.click(await screen.findByRole('button', { name: 'Has Workspace' }))
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Has Workspace' }).getAttribute('aria-pressed')
      ).toBe('true')
    )
  }

  describe.each(NETWORK_TRANSPORTS)('a host without dart.board.v1 over the $name', (transport) => {
    it('keeps phase 2 reads and disables the board switch with its tooltip', async () => {
      const host = transport.open({ board: false })
      renderPage()
      await screen.findByRole('heading', { name: SOURCE.title })

      const board = await screen.findByRole('radio', { name: 'Board' })
      await waitFor(() => expect(board.hasAttribute('disabled')).toBe(true))
      await showTooltip(BOARD_TOOLTIP)
      const reads = listReads(host)
      expect(reads.length).toBeGreaterThan(0)
      for (const read of reads) {
        expect(read.limit).toBe(100)
        expect(read).not.toHaveProperty('order')
        expect(read).not.toHaveProperty('offset')
      }
      expect(document.querySelector('[data-dart-board]')).toBeNull()
    })
  })

  describe('linked tasks', () => {
    it('keep phase 2 reads on a board host with the switch disabled and its tooltip', async () => {
      const host = desktop.open()
      seedFolderWorkspace()
      renderPage()
      await screen.findByRole('heading', { name: SOURCE.title })
      const readsBefore = listReads(host).length

      await openLinkedTasks()

      const board = await screen.findByRole('radio', { name: 'Board' })
      expect(board.hasAttribute('disabled')).toBe(true)
      await showTooltip(LINKED_TOOLTIP)
      await waitFor(() =>
        expect(host.requests.some(({ method }) => method === 'dart.getTask')).toBe(true)
      )
      expect(
        host.requests
          .filter(({ method }) => method === 'dart.getTask')
          .every(({ params }) => params.taskId === SOURCE.id)
      ).toBe(true)
      expect(listReads(host)).toHaveLength(readsBefore)
      expect(screen.getByRole('heading', { name: SOURCE.title })).toBeTruthy()
    })

    it('stay on in a folder workspace and still open the task', async () => {
      const host = desktop.open()
      seedFolderWorkspace()
      renderPage()

      await openLinkedTasks()
      expect(
        screen.getByRole('button', { name: 'Has Workspace' }).getAttribute('aria-pressed')
      ).toBe('true')

      fireEvent.click(screen.getByRole('heading', { name: SOURCE.title }))
      const sheet = await screen.findByRole('dialog')
      await within(sheet).findByRole('combobox', { name: 'Status' })
      expect(within(sheet).getByRole('combobox', { name: 'Status' }).textContent).toContain('To-do')
      expect(host.requests.some(({ method }) => method === 'dart.getTask')).toBe(true)
    })
  })

  describe.each(NETWORK_TRANSPORTS)(
    'a host without dart.savedViews.v1 over the $name',
    (transport) => {
      it('shows the update text and still filters', async () => {
        const host = transport.open({ savedViews: false })
        await wireWebSavedViews(transport)
        host.addTask(dartTaskFixture('otherTask001', { title: 'Other task', status: 'Doing' }))
        renderPage()
        await screen.findByRole('heading', { name: SOURCE.title })

        expect(
          await screen.findByText('Update the remote Orca server to save and reuse views.')
        ).toBeTruthy()
        const user = userEvent.setup()
        await user.click(screen.getByRole('combobox', { name: 'Status' }))
        await user.click(await screen.findByRole('option', { name: 'Doing' }))

        await screen.findByRole('heading', { name: 'Other task' })
        expect(screen.queryByRole('heading', { name: SOURCE.title })).toBeNull()
        expect(host.requests.some(({ method }) => method.includes('SavedViews'))).toBe(false)
      })
    }
  )

  describe.each(TRANSPORTS)('an unknown outcome over the $name', (transport) => {
    async function moveWithLostReply(): Promise<{ host: FakeDartHost; check: HTMLElement }> {
      const host = transport.open()
      host.lostReplies.push(UNKNOWN)
      renderPage()
      await screen.findByRole('heading', { name: SOURCE.title })
      await switchToBoard()
      await moveCard(SOURCE.title, 'Doing')
      const check = await screen.findByRole('button', { name: 'Check again' })
      await waitFor(() => expect(host.tasks.get(SOURCE.id)?.status).toBe('Doing'))
      expect(cardTitles('Doing')).toEqual([SOURCE.title])
      return { host, check }
    }

    it('keeps the card in the moved column when a check shows the write applied, until dismissed', async () => {
      const { check } = await moveWithLostReply()

      fireEvent.click(check)

      await screen.findByText(/Last checked/)
      expect(cardTitles('Doing')).toEqual([SOURCE.title])
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Check again' })).toBeNull())
      expect(cardTitles('Doing')).toEqual([SOURCE.title])
    })

    it('shows the card in its old column when a check shows the write was not applied', async () => {
      const { host, check } = await moveWithLostReply()
      host.tasks.set(SOURCE.id, { ...SOURCE, status: 'To-do' })

      fireEvent.click(check)

      await screen.findByText(/Last checked/)
      await waitFor(() => expect(cardTitles('To-do')).toEqual([SOURCE.title]))
    })
  })

  describe('host and account isolation', () => {
    async function saveView(name: string): Promise<void> {
      const user = userEvent.setup()
      await user.click(await screen.findByRole('button', { name: 'Saved views' }))
      await user.click(await screen.findByRole('button', { name: 'Save view' }))
      await user.type(await screen.findByRole('textbox', { name: 'Name' }), name)
      await user.click(await screen.findByRole('button', { name: 'Save view' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    }

    it('keeps a saved view and a moved card on host A off host B', async () => {
      const a = TRANSPORTS[0].open()
      const b = addRemote()
      const environmentA = [...remoteCapabilities.keys()][0]
      renderPage()
      await screen.findByRole('heading', { name: SOURCE.title })
      await saveView('Mine only')
      await waitFor(() => expect(a.savedViewState.views.map((v) => v.name)).toEqual(['Mine only']))
      await switchToBoard()
      await moveCard(SOURCE.title, 'Doing')
      await waitFor(() => expect(a.tasks.get(SOURCE.id)?.status).toBe('Doing'))

      act(() => {
        useAppStore.setState({
          settings: {
            ...useAppStore.getState().settings!,
            activeRuntimeEnvironmentId: [...remoteCapabilities.keys()][1]
          }
        })
      })

      await waitFor(() => expect(cardTitles('To-do')).toEqual([SOURCE.title]))
      expect(b.host.savedViewState.views).toEqual([])
      expect(b.host.tasks.get(SOURCE.id)?.status).toBe('To-do')
      expect(b.host.count('dart.updateTask')).toBe(0)
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Saved views' }))
      expect(await screen.findByText('No saved views yet.')).toBeTruthy()
      await user.keyboard('{Escape}')

      act(() => {
        useAppStore.setState({
          settings: {
            ...useAppStore.getState().settings!,
            activeRuntimeEnvironmentId: environmentA
          }
        })
      })

      // The active view saved in list layout wins over the stored board layout (D10).
      await screen.findByRole('button', { name: 'Mine only' })
      await switchToBoard()
      await waitFor(() => expect(cardTitles('Doing')).toEqual([SOURCE.title]))
      expect(a.savedViewState.views.map((v) => v.name)).toEqual(['Mine only'])
    })

    it('resets Dartboard on an account switch', async () => {
      const host = TRANSPORTS[0].open()
      renderPage()
      await screen.findByRole('heading', { name: SOURCE.title })
      const user = userEvent.setup()
      await user.click(screen.getByRole('combobox', { name: 'Dartboard' }))
      await user.click(await screen.findByRole('option', { name: 'Board A' }))
      await waitFor(() =>
        expect(screen.getByRole('combobox', { name: 'Dartboard' }).textContent).toContain('Board A')
      )

      const viewer = { id: 'user-b', name: 'Bo Example' }
      host.connection = { connected: true, viewer }
      act(() => {
        useAppStore.setState({ dartStatus: { connected: true, viewer } })
      })

      await waitFor(() =>
        expect(screen.getByRole('combobox', { name: 'Dartboard' }).textContent).toContain(
          'All dartboards'
        )
      )
    })
  })

  describe.each(TRANSPORTS)('web client probes over the $name', (transport) => {
    it('shows the same single-column board for the same host data', async () => {
      transport.open()
      renderPage()
      await screen.findByRole('heading', { name: SOURCE.title })

      await switchToBoard()

      expect(
        Array.from(document.querySelectorAll('[data-dart-column]'), (c) =>
          c.getAttribute('aria-label')
        )
      ).toEqual(['To-do, 1'])
      expect(cardTitles('To-do')).toEqual([SOURCE.title])
    })
  })

  describe('the /config on-hold cases', () => {
    const CASES = [
      { name: 'status only', status: true, tag: false },
      { name: 'tag only', status: false, tag: true },
      { name: 'status and tag', status: true, tag: true },
      { name: 'neither', status: false, tag: false }
    ]

    function openWithConfig(offered: { status: boolean; tag: boolean }): FakeDartHost {
      const host = TRANSPORTS[0].open()
      serveConfig(host, {
        statuses: ['To-do', 'Doing', 'Done', ...(offered.status ? ['On hold'] : [])],
        tags: ['search', ...(offered.tag ? ['on-hold'] : [])]
      })
      host.addTask(
        dartTaskFixture('tagged000001', {
          title: 'Tagged task',
          status: 'Doing',
          tags: ['on-hold'],
          dartboard: 'Board A'
        })
      )
      return host
    }

    async function statusOptions(title: string): Promise<string[]> {
      fireEvent.click(await screen.findByText(title))
      const sheet = await screen.findByRole('dialog')
      const user = userEvent.setup()
      await user.click(await within(sheet).findByRole('combobox', { name: 'Status' }))
      const options = (await screen.findAllByRole('option')).map((o) => o.textContent ?? '')
      await user.keyboard('{Escape}')
      return options
    }

    it.each(CASES)(
      'with $name: the chip, the column and the status picker follow /config',
      async (offered) => {
        openWithConfig(offered)
        renderPage()
        await screen.findByRole('heading', { name: SOURCE.title })
        await switchToBoard()

        const chip = screen.queryByRole('button', { name: 'On hold' })
        expect(chip !== null).toBe(offered.status || offered.tag)
        expect(screen.queryByRole('group', { name: /^On hold, / })).toBeNull()

        fireEvent.click(await screen.findByRole('switch', { name: 'Show empty columns' }))
        await waitFor(() =>
          expect(screen.queryByRole('group', { name: /^On hold, / }) !== null).toBe(offered.status)
        )

        fireEvent.click(screen.getByRole('radio', { name: 'List' }))
        const options = await statusOptions('Tagged task')
        expect(options.includes('On hold')).toBe(offered.status)
      }
    )

    it.each(CASES.filter((offered) => offered.status))(
      'with $name: a task carrying the status gets the column without Show empty columns',
      async (offered) => {
        const host = openWithConfig(offered)
        host.addTask(
          dartTaskFixture('held00000001', {
            title: 'Held task',
            status: 'On hold',
            dartboard: 'Board A'
          })
        )
        renderPage()
        await screen.findByRole('heading', { name: SOURCE.title })
        await switchToBoard()

        expect(cardTitles('On hold')).toEqual(['Held task'])
        fireEvent.click(screen.getByRole('button', { name: 'On hold' }))

        await waitFor(() =>
          expect(document.querySelectorAll('[data-dart-card-id]')).toHaveLength(2)
        )
        expect(cardTitles('On hold')).toEqual(['Held task'])
        expect(cardTitles('Doing')).toEqual(['Tagged task'])
      }
    )

    it('gives a task with a status that /config does not list its own column', async () => {
      const host = openWithConfig({ status: false, tag: false })
      host.addTask(
        dartTaskFixture('mystery00001', {
          title: 'Mystery task',
          status: 'Waiting on legal',
          dartboard: 'Board A'
        })
      )
      renderPage()
      await screen.findByRole('heading', { name: SOURCE.title })
      await switchToBoard()

      expect(cardTitles('Waiting on legal')).toEqual(['Mystery task'])
    })
  })

  describe.each(TRANSPORTS)('request order keys over the $name', (transport) => {
    it('orders open pages by board order and finished pages by completion', async () => {
      const host = transport.open()
      host.addTask(
        dartTaskFixture('finished00001', {
          title: 'Finished task',
          status: 'Done',
          completedAt: '2026-01-01T00:00:00.000Z'
        })
      )
      renderPage()
      await screen.findByRole('heading', { name: SOURCE.title })
      await switchToBoard()
      await screen.findByText('Finished task')

      const reads = listReads(host)
      const open = reads.filter((read) => read.isCompleted === false)
      const finished = reads.filter((read) => read.isCompleted === true)
      expect(open.length).toBeGreaterThan(0)
      expect(finished.length).toBeGreaterThan(0)
      expect(open.every((read) => read.order === 'order')).toBe(true)
      expect(finished.every((read) => read.order === '-completed_at')).toBe(true)
      expect(open.length + finished.length).toBe(reads.length)
    })
  })
})
