// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { DartComment } from '../../../../shared/dart/dart-types'
import type { Worktree } from '../../../../shared/worktree/types'
import type { TaskSourceContext } from '../../../../shared/task-source-context'
import { installAppKeyboardRouter } from '@/lib/app-keyboard-router'
import { createCompatibleRuntimeStatusResponse } from '@/runtime/runtime-compatibility-test-fixture'
import { useAppStore } from '@/store'
import type { FakeDartHost } from '@/store/slices/dart/dart-fake-runtime.test-support'
import { clearDartProviderVerdictCacheForTests } from '@/web/preload-api/web-dart-api'
import {
  addRemote,
  installDeliveryRuntime,
  probedSelectors,
  remoteCapabilities,
  SOURCE,
  TRANSPORTS,
  VIEWER,
  web
} from './dart-delivery-transports.test-support'
import TaskPage from './TaskPage'

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

const realWindow = window
const UNKNOWN = {
  ok: false,
  error: 'Failed to update Dart task.',
  errorCode: 'dart.updateFailed',
  outcome: 'unknown'
} as const

function fieldWrites(host: FakeDartHost): Record<string, unknown>[] {
  return host.requests
    .filter(({ method }) => method === 'dart.updateTask')
    .map(({ params }) => params.updates ?? {})
}

beforeEach(() => {
  installDeliveryRuntime()
  // The web client caches a positive provider verdict per host id, and every test shares one.
  clearDartProviderVerdictCacheForTests()
  remoteCapabilities.clear()
  probedSelectors.length = 0
  const api = window.api
  const { call } = api.runtimeEnvironments
  Object.assign(api.runtimeEnvironments, {
    call: (args: Parameters<typeof call>[0]) => {
      if (args.method !== 'status.get') {
        return call(args)
      }
      probedSelectors.push(args.selector)
      const reply = createCompatibleRuntimeStatusResponse(args.selector)
      return Promise.resolve({
        ...reply,
        result: { ...reply.result, capabilities: remoteCapabilities.get(args.selector) }
      })
    }
  })
  vi.unstubAllGlobals()
  const quiet = new Proxy({}, { get: () => vi.fn(() => Promise.resolve(null)) })
  Object.defineProperty(realWindow, 'api', {
    value: new Proxy(api, { get: (target, key) => (key in target ? target[key] : quiet) }),
    configurable: true
  })
  installAppKeyboardRouter()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderPage(): void {
  render(
    <TooltipProvider>
      <TaskPage />
    </TooltipProvider>
  )
}

function listRow(title: string): HTMLElement {
  // Queried by tag: a rendered sheet hides the list behind it from role queries.
  const heading = Array.from(document.querySelectorAll('h3')).find((h) => h.textContent === title)
  const row = heading?.closest('[role="button"]')
  if (!(row instanceof HTMLElement)) {
    throw new Error(`No list row for ${title}`)
  }
  return row
}

async function openDetailFromList(title = SOURCE.title): Promise<HTMLElement> {
  fireEvent.click(await screen.findByRole('heading', { name: title }))
  const sheet = await screen.findByRole('dialog')
  await within(sheet).findByRole('combobox', { name: 'Status' })
  return sheet
}

async function choose(sheet: HTMLElement, label: string, option: string): Promise<void> {
  const user = userEvent.setup()
  const trigger = await within(sheet).findByRole('combobox', { name: label })
  await user.click(trigger)
  await user.click(await screen.findByRole('option', { name: option }))
}

async function closeDetail(): Promise<void> {
  await userEvent.setup().click(screen.getByRole('button', { name: 'Close Dart task preview' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
}

describe.each(TRANSPORTS)('field edits over the $name', (transport) => {
  it('delivers a status edit and shows it in the detail and the list', async () => {
    const host = transport.open()
    renderPage()
    const sheet = await openDetailFromList()

    await choose(sheet, 'Status', 'Done')

    await waitFor(() => expect(host.tasks.get(SOURCE.id)?.status).toBe('Done'))
    expect(fieldWrites(host)).toEqual([{ status: 'Done' }])
    expect(host.requests.find(({ method }) => method === 'dart.updateTask')?.params.taskId).toBe(
      SOURCE.id
    )
    expect(within(sheet).getByRole('combobox', { name: 'Status' }).textContent).toContain('Done')
    await closeDetail()
    expect(within(listRow(SOURCE.title)).getAllByText('Done').length).toBeGreaterThan(0)
  })

  it('does not resend a write whose reply was lost, and shows what Dart holds after Check again', async () => {
    const host = transport.open()
    renderPage()
    const sheet = await openDetailFromList()
    host.lostReplies.push(UNKNOWN)

    await choose(sheet, 'Status', 'Done')

    const notice = await screen.findByRole('status')
    expect(notice.textContent).toContain('Dart may have applied this change')
    expect(host.tasks.get(SOURCE.id)?.status).toBe('Done')
    await userEvent.setup().click(within(notice).getByRole('button', { name: 'Check again' }))
    await waitFor(() =>
      expect(within(screen.getByRole('status')).queryByText(/Last checked/)).toBeTruthy()
    )

    expect(within(sheet).getByRole('combobox', { name: 'Status' }).textContent).toContain('Done')
    expect(host.count('dart.updateTask')).toBe(1)
    await closeDetail()
    expect(within(listRow(SOURCE.title)).getAllByText('Done').length).toBeGreaterThan(0)
  })
})

describe.each(TRANSPORTS)('a host without dart.writes.v2 over the $name', (transport) => {
  it('edits the supported fields and sends no size, date or description patch', async () => {
    const host = transport.open({ writesV2: false })
    host.tasks.set(SOURCE.id, { ...SOURCE, size: '3', dueAt: '2026-11-20T00:00:00.000Z' })
    renderPage()
    const sheet = await openDetailFromList()
    const user = userEvent.setup()

    await choose(sheet, 'Status', 'Done')
    await waitFor(() => expect(fieldWrites(host)).toHaveLength(1))
    await choose(sheet, 'Priority', 'High')
    await waitFor(() => expect(fieldWrites(host)).toHaveLength(2))
    await choose(sheet, 'Assignee', 'Sam Example')
    await waitFor(() => expect(fieldWrites(host)).toHaveLength(3))
    await choose(sheet, 'Dartboard', 'Board B')
    await waitFor(() => expect(fieldWrites(host)).toHaveLength(4))
    await user.click(within(sheet).getByRole('button', { name: 'Tags' }))
    await user.click(await screen.findByRole('option', { name: 'search' }))
    await waitFor(() => expect(fieldWrites(host)).toHaveLength(5))
    await user.keyboard('{Escape}')
    const title = within(sheet).getByRole('textbox', { name: 'Title' })
    await user.clear(title)
    await user.type(title, 'Renamed{Enter}')
    await waitFor(() => expect(fieldWrites(host)).toHaveLength(6))

    expect(fieldWrites(host)).toEqual([
      { status: 'Done' },
      { priority: 'High' },
      { assignee: 'Sam Example' },
      { dartboard: 'Board B' },
      { tags: ['search'] },
      { title: 'Renamed' }
    ])
    expect(host.count('dart.updateTaskDescription')).toBe(0)
    expect(JSON.stringify(host.requests)).not.toMatch(/"(size|startAt|dueAt)"/)
  })

  it('shows size and dates as text and the description read-only with Copy and Open in Dart', async () => {
    const host = transport.open({ writesV2: false })
    host.tasks.set(SOURCE.id, { ...SOURCE, size: '3', dueAt: '2026-11-20T00:00:00.000Z' })
    renderPage()
    const sheet = await openDetailFromList()

    await within(sheet).findByText('11/20/2026')
    expect(within(sheet).queryByRole('combobox', { name: 'Size' })).toBeNull()
    expect(within(sheet).queryByLabelText('Start')).toBeNull()
    expect(within(sheet).queryByLabelText('Due')).toBeNull()
    expect(
      await within(sheet).findByText('Update the remote Orca server to edit descriptions.')
    ).toBeTruthy()
    expect(within(sheet).getByText('Original description')).toBeTruthy()
    expect(within(sheet).getByRole('button', { name: 'Copy' })).toBeTruthy()
    expect(within(sheet).getAllByRole('button', { name: 'Open in Dart' }).length).toBeGreaterThan(0)
    expect(within(sheet).queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(host.count('dart.updateTask') + host.count('dart.updateTaskDescription')).toBe(0)
  })
})

describe('a host without dart.provider.v1', () => {
  it('shows the update-required state over the remote RPC and receives no Dart request', async () => {
    const host = TRANSPORTS[0].open({ providerV1: false })
    renderPage()

    expect(await screen.findByText('Update the remote Orca server to use Dart.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Connect Dart' })).toBeNull()
    await act(async () => {})
    expect(host.requests).toEqual([])
  })
})

describe('a web-paired host without dart.provider.v1', () => {
  it('shows the update-required state', async () => {
    TRANSPORTS[1].open({ providerV1: false })
    renderPage()

    expect(await screen.findByText('Update the remote Orca server to use Dart.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Connect Dart' })).toBeNull()
  })
})

function explicitScope(environmentId: string, userId: string): TaskSourceContext {
  return {
    kind: 'task-source',
    provider: 'dart',
    projectId: 'project-1',
    hostId: `runtime:${environmentId}`,
    providerIdentity: { provider: 'dart', userId }
  }
}

function openInStore(sourceContext?: TaskSourceContext): void {
  act(() => {
    useAppStore.setState({
      taskPageData: {
        taskSource: 'dart',
        openDartTask: SOURCE,
        ...(sourceContext ? { openDartSourceContext: sourceContext } : {})
      }
    })
  })
}

function rowStatusTexts(): string[] {
  return Array.from(listRow(SOURCE.title).querySelectorAll('span')).map(
    (el) => el.textContent ?? ''
  )
}

describe('scope and identity over the remote RPC', () => {
  async function pageOnHostWithListedTask() {
    const host = TRANSPORTS[0].open()
    renderPage()
    await screen.findByRole('heading', { name: SOURCE.title })
    return host
  }

  it('sends config, comments, reads, edits and the capability probe to the detail’s own scope', async () => {
    const page = await pageOnHostWithListedTask()
    const other = addRemote()
    other.host.tasks.set(SOURCE.id, { ...SOURCE, status: 'Doing' })
    const pageListReads = page.count('dart.listTasks')

    openInStore(explicitScope(other.environmentId, VIEWER.id))
    const sheet = await screen.findByRole('dialog')
    await waitFor(() =>
      expect(within(sheet).getByRole('combobox', { name: 'Status' }).textContent).toContain('Doing')
    )
    await choose(sheet, 'Status', 'Done')

    await waitFor(() => expect(other.host.tasks.get(SOURCE.id)?.status).toBe('Done'))
    expect(other.host.count('dart.config')).toBeGreaterThan(0)
    expect(other.host.count('dart.listComments')).toBeGreaterThan(0)
    expect(other.host.count('dart.getTask')).toBeGreaterThan(0)
    expect(other.host.count('dart.listTasks')).toBe(0)
    expect(probedSelectors).toContain(other.environmentId)
    expect(page.count('dart.updateTask')).toBe(0)
    expect(page.count('dart.listComments')).toBe(0)
    expect(page.count('dart.listTasks')).toBe(pageListReads)
    expect(page.tasks.get(SOURCE.id)?.status).toBe('To-do')
    expect(rowStatusTexts()).not.toContain('Done')
  })

  it('updates the default-scope list row after an edit made in the detail of the same host and account', async () => {
    const page = await pageOnHostWithListedTask()
    openInStore(explicitScope(page === null ? '' : [...remoteCapabilities.keys()][0], VIEWER.id))
    const sheet = await screen.findByRole('dialog')
    await within(sheet).findByRole('combobox', { name: 'Status' })

    await choose(sheet, 'Status', 'Done')
    await waitFor(() => expect(page.tasks.get(SOURCE.id)?.status).toBe('Done'))

    expect(rowStatusTexts()).toContain('Done')
  })

  it('leaves the list row of another account on the same host untouched', async () => {
    const page = await pageOnHostWithListedTask()
    openInStore(explicitScope([...remoteCapabilities.keys()][0], 'user-b'))
    const sheet = await screen.findByRole('dialog')
    await within(sheet).findByRole('combobox', { name: 'Status' })

    await choose(sheet, 'Status', 'Done')
    await waitFor(() => expect(page.tasks.get(SOURCE.id)?.status).toBe('Done'))

    expect(rowStatusTexts()).not.toContain('Done')
  })
})

describe.each(TRANSPORTS)('reads and writes that cross over the $name', (transport) => {
  it('keeps a written status when a list read that began before the write lands after it', async () => {
    const host = transport.open()
    renderPage()
    await screen.findByRole('heading', { name: SOURCE.title })
    const refresh = screen.getByRole('button', { name: 'Refresh Dart tasks' })
    await waitFor(() => expect(refresh.hasAttribute('disabled')).toBe(false))
    const release = host.hold('dart.listTasks')
    fireEvent.click(refresh)
    await waitFor(() => expect(host.count('dart.listTasks')).toBe(2))
    openInStore()
    const sheet = await screen.findByRole('dialog')
    await within(sheet).findByRole('combobox', { name: 'Status' })

    await choose(sheet, 'Status', 'Done')
    await waitFor(() => expect(host.tasks.get(SOURCE.id)?.status).toBe('Done'))
    await act(async () => release())

    await waitFor(() => expect(host.count('dart.listTasks')).toBeGreaterThan(2))
    await act(async () => {})
    expect(rowStatusTexts()).toContain('Done')
    expect(rowStatusTexts()).not.toContain('To-do')
  })

  it('shows a field changed in Dart while another field’s write is pending, and keeps both', async () => {
    const host = transport.open()
    renderPage()
    const sheet = await openDetailFromList()
    const release = host.hold('dart.updateTask')

    await choose(sheet, 'Status', 'Done')
    await waitFor(() => expect(host.count('dart.updateTask')).toBe(1))
    host.tasks.set(SOURCE.id, { ...host.tasks.get(SOURCE.id)!, priority: 'High' })
    await act(async () => release())

    await waitFor(
      () => expect(host.tasks.get(SOURCE.id)).toMatchObject({ status: 'Done', priority: 'High' }),
      { timeout: 3000 }
    )
    await waitFor(
      () =>
        expect(within(sheet).getByRole('combobox', { name: 'Priority' }).textContent).toContain(
          'High'
        ),
      { timeout: 3000 }
    )
    expect(within(sheet).getByRole('combobox', { name: 'Status' }).textContent).toContain('Done')
    expect(fieldWrites(host)).toEqual([{ status: 'Done' }])
  })
})

describe('a plain folder workspace linked to a Dart task', () => {
  function seedFolderWorkspace(): void {
    const workspace: Worktree = {
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
          provider: 'dart',
          type: 'issue',
          number: 0,
          identifier: SOURCE.id,
          url: SOURCE.htmlUrl,
          title: SOURCE.title,
          // A link made on a paired server names that server; a local link carries no source.
          ...(remoteCapabilities.size
            ? { taskSourceContext: explicitScope([...remoteCapabilities.keys()][0], VIEWER.id) }
            : {})
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

  it.each(TRANSPORTS)(
    'opens the task from its row and saves a status edit over the $name',
    async (transport) => {
      const host = transport.open()
      seedFolderWorkspace()
      renderPage()
      await screen.findByRole('heading', { name: SOURCE.title })
      expect(within(listRow(SOURCE.title)).getByText('Notes folder')).toBeTruthy()

      const sheet = await openDetailFromList()
      await choose(sheet, 'Status', 'Done')

      await waitFor(() => expect(host.tasks.get(SOURCE.id)?.status).toBe('Done'))
      expect(fieldWrites(host)).toEqual([{ status: 'Done' }])
      expect(within(sheet).getByRole('combobox', { name: 'Status' }).textContent).toContain('Done')
    }
  )
})

/** Keeps comments the way a Dart workspace does; the shared fake stores none and returns one fixed id. */
function storeComments(host: FakeDartHost, seed: DartComment[] = []): DartComment[] {
  const comments = [...seed]
  const handle = host.handle.bind(host)
  host.handle = async (method, params) => {
    if (method === 'dart.listComments') {
      host.requests.push({ method, params })
      const mine = comments.filter((comment) => comment.taskId === params.taskId)
      return { ok: true, comments: mine, totalCount: mine.length }
    }
    if (method === 'dart.addComment') {
      host.requests.push({ method, params })
      const posted = params
      const comment: DartComment = {
        id: `posted${String(comments.length + 1).padStart(6, '0')}`,
        taskId: posted.taskId ?? '',
        parentId: posted.parentId ?? null,
        htmlUrl: 'https://app.dartai.com/c/posted',
        author: VIEWER.name,
        text: posted.text ?? '',
        createdAt: new Date(Date.UTC(2026, 10, 5, 12, comments.length)).toISOString()
      }
      comments.push(comment)
      return host.lostReplies.shift() ?? { ok: true, comment }
    }
    return handle(method, params)
  }
  return comments
}

function seededComments(taskId: string): DartComment[] {
  return ['first', 'second'].map((word, index) => ({
    id: `seeded${word}00`,
    taskId,
    parentId: null,
    htmlUrl: `https://app.dartai.com/c/${word}`,
    author: 'Sam Example',
    text: `Seeded ${word} comment`,
    createdAt: new Date(Date.UTC(2026, 10, 4, 12, index)).toISOString()
  }))
}

function commentArticle(sheet: HTMLElement, text: string): HTMLElement {
  const article = within(sheet).getByText(text).closest('article')
  if (!(article instanceof HTMLElement)) {
    throw new Error(`No comment article for ${text}`)
  }
  return article
}

function commentPosts(host: FakeDartHost): { taskId?: string; text?: string; parentId?: string }[] {
  return host.requests.filter(({ method }) => method === 'dart.addComment').map((r) => r.params)
}

async function postComment(sheet: HTMLElement, text: string): Promise<void> {
  const user = userEvent.setup()
  await user.type(await within(sheet).findByRole('textbox', { name: 'Comment' }), text)
  await user.click(within(sheet).getByRole('button', { name: 'Send comment' }))
}

describe.each(TRANSPORTS)('comments over the $name', (transport) => {
  it('delivers a new comment once to the task’s host and renders it in the detail', async () => {
    const host = transport.open()
    const stored = storeComments(host)
    renderPage()
    const sheet = await openDetailFromList()

    await postComment(sheet, 'Looks good to me')

    expect(await within(sheet).findByText('Looks good to me')).toBeTruthy()
    expect(commentPosts(host)).toEqual([{ taskId: SOURCE.id, text: 'Looks good to me' }])
    expect(stored.map((comment) => comment.text)).toEqual(['Looks good to me'])
    expect(within(sheet).getAllByRole('article')).toHaveLength(1)
  })

  it('posts a reply under the chosen parent and renders it threaded', async () => {
    const host = transport.open()
    storeComments(host, seededComments(SOURCE.id))
    renderPage()
    const sheet = await openDetailFromList()
    await within(sheet).findByText('Seeded second comment')

    await userEvent.setup().click(
      within(commentArticle(sheet, 'Seeded second comment')).getByRole('button', {
        name: 'Reply'
      })
    )
    expect(within(sheet).getByText('Replying to Sam Example')).toBeTruthy()
    await postComment(sheet, 'Answering the second one')

    const reply = await within(sheet).findByText('Answering the second one')
    expect(commentPosts(host)).toEqual([
      { taskId: SOURCE.id, text: 'Answering the second one', parentId: 'seededsecond00' }
    ])
    expect(reply.closest('article')?.getAttribute('data-depth')).toBe('1')
    const order = within(sheet)
      .getAllByRole('article')
      .map((article) => article.getAttribute('data-depth'))
    expect(order).toEqual(['0', '0', '1'])
    expect(within(sheet).getAllByRole('article')[2].textContent).toContain('Answering the second')
  })

  it('does not repost a comment whose reply was lost, and shows it once after Check again', async () => {
    const host = transport.open()
    const stored = storeComments(host)
    renderPage()
    const sheet = await openDetailFromList()
    host.lostReplies.push({ ...UNKNOWN, error: 'Failed to add comment.' })

    await postComment(sheet, 'Ship it')

    expect(await within(sheet).findByText(/Not sure it posted/)).toBeTruthy()
    expect(stored.map((comment) => comment.text)).toEqual(['Ship it'])
    const notice = within(sheet)
      .getAllByRole('status')
      .find((el) => /Not sure it posted/.test(el.textContent ?? ''))!
    await userEvent.setup().click(within(notice).getByRole('button', { name: 'Check again' }))

    await waitFor(() => expect(within(sheet).queryByText(/Not sure it posted/)).toBeNull())
    expect(within(sheet).getAllByText('Ship it')).toHaveLength(1)
    expect(commentPosts(host)).toHaveLength(1)
    expect(stored).toHaveLength(1)
  })
})

describe.each(TRANSPORTS)('creating a task over the $name', (transport) => {
  async function fillAndSubmit(title: string): Promise<void> {
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'New task' }))
    await user.type(await screen.findByLabelText('Title'), title)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create task' })).toHaveProperty('disabled', false)
    )
    await user.click(screen.getByRole('button', { name: 'Create task' }))
  }

  beforeEach(() => {
    useAppStore.setState({ dartCreateSessions: {}, dartCreateOwners: {} })
    const uiState = { featureInteractions: {} }
    Object.assign(window.api, {
      ui: {
        get: vi.fn(() => Promise.resolve(uiState)),
        recordFeatureInteraction: vi.fn(() => Promise.resolve(uiState))
      }
    })
  })

  it('sends one create with the entered fields, opens the task and lists it', async () => {
    const host = transport.open()
    renderPage()
    await screen.findByRole('heading', { name: SOURCE.title })

    await fillAndSubmit('Brand new delivery task')

    await waitFor(() => expect(host.count('dart.createTask')).toBe(1))
    const create = host.requests.find(({ method }) => method === 'dart.createTask')!
    expect(create.params).toMatchObject({ title: 'Brand new delivery task', dartboard: 'Board A' })
    expect(
      [...host.tasks.values()].filter((t) => t.title === 'Brand new delivery task')
    ).toHaveLength(1)
    const sheet = await screen.findByRole('dialog')
    await waitFor(() =>
      expect(within(sheet).getByRole('textbox', { name: 'Title' })).toHaveProperty(
        'value',
        'Brand new delivery task'
      )
    )
    await closeDetail()
    expect(listRow('Brand new delivery task')).toBeTruthy()
    expect(host.count('dart.createTask')).toBe(1)
  })

  it('does not create again after a lost reply and finds the one task on Check again', async () => {
    const host = transport.open()
    host.lostReplies.push({ ...UNKNOWN, error: 'Failed to create Dart task.' })
    renderPage()
    await screen.findByRole('heading', { name: SOURCE.title })

    await fillAndSubmit('Lost reply task')

    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText(/Dart may have created this task/)
    expect(host.count('dart.createTask')).toBe(1)
    const created = [...host.tasks.values()].filter((t) => t.title === 'Lost reply task')
    expect(created).toHaveLength(1)
    expect(await within(dialog).findByRole('button', { name: 'Lost reply task' })).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Create task' })).toHaveProperty(
      'disabled',
      true
    )

    await userEvent.setup().click(within(dialog).getAllByRole('button', { name: 'Check again' })[0])
    await within(dialog).findByRole('button', { name: 'Lost reply task' })

    expect(host.count('dart.createTask')).toBe(1)
    expect([...host.tasks.values()].filter((t) => t.title === 'Lost reply task')).toHaveLength(1)
  })
})

describe('comments in a detail scoped to another host over the remote RPC', () => {
  it('posts the comment and the reply to that host only', async () => {
    const page = TRANSPORTS[0].open()
    const pageComments = storeComments(page, seededComments(SOURCE.id))
    renderPage()
    await screen.findByRole('heading', { name: SOURCE.title })
    const other = addRemote()
    const otherComments = storeComments(other.host, seededComments(SOURCE.id))
    const pageReads = page.count('dart.listComments')

    openInStore(explicitScope(other.environmentId, VIEWER.id))
    const sheet = await screen.findByRole('dialog')
    await within(sheet).findByText('Seeded first comment')
    await postComment(sheet, 'Scoped comment')
    await within(sheet).findByText('Scoped comment')
    await userEvent
      .setup()
      .click(
        within(commentArticle(sheet, 'Seeded first comment')).getByRole('button', { name: 'Reply' })
      )
    await postComment(sheet, 'Scoped reply')
    await within(sheet).findByText('Scoped reply')

    expect(commentPosts(other.host)).toEqual([
      { taskId: SOURCE.id, text: 'Scoped comment' },
      { taskId: SOURCE.id, text: 'Scoped reply', parentId: 'seededfirst00' }
    ])
    expect(otherComments).toHaveLength(4)
    expect(page.count('dart.addComment')).toBe(0)
    expect(page.count('dart.listComments')).toBe(pageReads)
    expect(pageComments).toHaveLength(2)
  })
})
