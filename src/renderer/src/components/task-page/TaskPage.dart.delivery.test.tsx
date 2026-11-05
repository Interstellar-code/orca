// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { getDefaultSettings } from '../../../../shared/constants'
import {
  DART_PROVIDER_RUNTIME_CAPABILITY,
  DART_WRITES_V2_RUNTIME_CAPABILITY
} from '../../../../shared/dart/dart-capabilities'
import type { DartTask, DartWorkspaceConfig } from '../../../../shared/dart/dart-types'
import type { TaskSourceContext } from '../../../../shared/task-source-context'
import { installAppKeyboardRouter } from '@/lib/app-keyboard-router'
import { createCompatibleRuntimeStatusResponse } from '@/runtime/runtime-compatibility-test-fixture'
import { useAppStore } from '@/store'
import {
  dartTaskFixture,
  FakeDartHost,
  installFakeDartRuntime
} from '@/store/slices/dart/dart-fake-runtime.test-support'
import {
  clearDartProviderVerdictCacheForTests,
  createWebDartApi
} from '@/web/preload-api/web-dart-api'
import TaskPage from './TaskPage'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/components/PullRequestPage', () => ({ default: () => null }))
vi.mock('@/components/GitHubItemDialog', () => ({ default: () => null }))
vi.mock('./github/List', () => ({ TaskPageGitHubList: () => null }))
vi.mock('./jira/Content', () => ({ TaskPageJiraContent: () => null }))
vi.mock('./linear/Content', () => ({ TaskPageLinearContent: () => null }))

// The web client's only outbound seam: it reaches the paired host through these two modules.
const web = vi.hoisted(() => ({
  host: null as null | FakeDartHost,
  capabilities: [] as string[],
  /** An older server has no `dart.*` methods at all. */
  methodNotFound: false
}))
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
const VIEWER = { id: 'user-a', name: 'Alex Example' }
const CONFIG: DartWorkspaceConfig = {
  dartboards: ['Board A', 'Board B'],
  statuses: ['To-do', 'Doing', 'Done'],
  types: [],
  tags: ['search', 'backend'],
  priorities: ['High', 'Medium', 'Low'],
  sizes: ['1', '3', '5'],
  assignees: [VIEWER.name, 'Sam Example']
}
function sourceTask(id: string): DartTask {
  return dartTaskFixture(id, {
    title: 'Delivery task',
    status: 'To-do',
    priority: 'Medium',
    dartboard: 'Board A',
    description: 'Original description'
  })
}
const UNKNOWN = {
  ok: false,
  error: 'Failed to update Dart task.',
  errorCode: 'dart.updateFailed',
  outcome: 'unknown'
} as const

// Write blocks and notices outlive a host switch by design, so every test gets its own task id.
let SOURCE = sourceTask('delivTask000')
let nextEnv = 0
let runtime: ReturnType<typeof installFakeDartRuntime>

/** The shared fake answers neither config nor comments. */
function serveConfigAndComments(host: FakeDartHost): void {
  const handle = host.handle.bind(host)
  host.handle = async (method, params) => {
    if (method === 'dart.config' || method === 'dart.listComments') {
      host.requests.push({ method, params })
      return method === 'dart.config'
        ? { ok: true, config: CONFIG }
        : { ok: true, comments: [], totalCount: 0 }
    }
    return handle(method, params)
  }
}

function fieldWrites(host: FakeDartHost): Record<string, unknown>[] {
  return host.requests
    .filter(({ method }) => method === 'dart.updateTask')
    .map(({ params }) => params.updates ?? {})
}

type Transport = {
  name: string
  /** Seeds the page on a host that advertises exactly `capabilities`. */
  open(options?: { writesV2?: boolean; providerV1?: boolean }): FakeDartHost
}

function freshSource(): void {
  nextEnv += 1
  SOURCE = sourceTask(`delivTask${String(nextEnv).padStart(3, '0')}`)
}

function seedPage(environmentId: string | null): void {
  // The web client always reads as scope `local`, so a cache from an earlier test would answer for this host.
  useAppStore.setState({ dartTaskCache: {}, dartListCache: {}, dartConfigCache: {} })
  const settings = {
    ...getDefaultSettings('/home/alex'),
    visibleTaskProviders: ['github' as const, 'dart' as const],
    defaultTaskSource: 'dart' as const,
    activeRuntimeEnvironmentId: environmentId
  }
  useAppStore.setState({
    settings,
    persistedUIReady: true,
    activeView: 'tasks',
    taskPageData: {},
    dartStatus: { connected: false, viewer: null },
    dartStatusChecked: false,
    dartUpdateRequired: false,
    checkLinearConnection: vi.fn(() => Promise.resolve()),
    checkJiraConnection: vi.fn(() => Promise.resolve()),
    refreshPreflightStatus: vi.fn(() => Promise.resolve())
  })
}

function capabilitiesOf(options: { writesV2?: boolean; providerV1?: boolean }): string[] {
  return [
    ...(options.providerV1 === false ? [] : [DART_PROVIDER_RUNTIME_CAPABILITY]),
    ...(options.writesV2 === false ? [] : [DART_WRITES_V2_RUNTIME_CAPABILITY])
  ]
}

const remoteCapabilities = new Map<string, string[]>()
const probedSelectors: string[] = []

/** Another paired server with its own Dart workspace; `task` is the same id on every server. */
function addRemote(options: { writesV2?: boolean; providerV1?: boolean } = {}): {
  environmentId: string
  host: FakeDartHost
} {
  nextEnv += 1
  const environmentId = `remote-env-${nextEnv}`
  remoteCapabilities.set(environmentId, capabilitiesOf(options))
  const host = runtime.host(environmentId)
  serveConfigAndComments(host)
  host.addTask(SOURCE)
  return { environmentId, host }
}

const TRANSPORTS: Transport[] = [
  {
    name: 'remote RPC',
    open: (options = {}) => {
      freshSource()
      const { environmentId, host } = addRemote(options)
      seedPage(environmentId)
      return host
    }
  },
  {
    name: 'web-paired host',
    open: (options = {}) => {
      freshSource()
      const host = new FakeDartHost()
      serveConfigAndComments(host)
      host.addTask(SOURCE)
      web.host = host
      web.capabilities = capabilitiesOf(options)
      web.methodNotFound = options.providerV1 === false
      Object.assign(window.api, { dart: createWebDartApi() })
      seedPage(null)
      return host
    }
  }
]

beforeEach(() => {
  runtime = installFakeDartRuntime()
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
    } as never)
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
