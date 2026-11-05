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
import type { DartComment, DartTask, DartWorkspaceConfig } from '../../../../shared/dart/dart-types'
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
// Write blocks and notices outlive a host switch by design, so every test gets its own task id.
let SOURCE = sourceTask('delivTask000')
let nextEnv = 0
let runtime: ReturnType<typeof installFakeDartRuntime>

const SEED_COMMENT = {
  id: 'seedComment1',
  taskId: '',
  author: 'Sam Example',
  text: 'Seed comment from Sam'
}

/** The shared fake answers neither config nor comments; this one lists what the host holds. */
function serveConfigAndComments(host: FakeDartHost): void {
  const handle = host.handle.bind(host)
  const posted: DartComment[] = []
  host.handle = async (method, params) => {
    if (method === 'dart.config' || method === 'dart.listComments') {
      host.requests.push({ method, params })
      return method === 'dart.config'
        ? { ok: true, config: CONFIG }
        : {
            ok: true,
            comments: [{ ...SEED_COMMENT, taskId: params.taskId ?? '' }, ...posted],
            totalCount: posted.length + 1
          }
    }
    if (method === 'dart.addComment') {
      host.requests.push({ method, params })
      const comment: DartComment = {
        id: `posted${String(posted.length).padStart(6, '0')}`,
        taskId: params.taskId ?? '',
        author: VIEWER.name,
        text: params.text ?? '',
        htmlUrl: ''
      }
      posted.push(comment)
      return { ok: true, comment }
    }
    return handle(method, params)
  }
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

async function openDetailFromList(title = SOURCE.title): Promise<HTMLElement> {
  fireEvent.click(await screen.findByRole('heading', { name: title }))
  const sheet = await screen.findByRole('dialog')
  await within(sheet).findByRole('combobox', { name: 'Status' })
  return sheet
}

describe.each(TRANSPORTS)(
  'comments on a host without dart.writes.v2 over the $name',
  (transport) => {
    it('posts a comment and a reply with the normal body and renders both', async () => {
      const host = transport.open({ writesV2: false })
      renderPage()
      const sheet = await openDetailFromList()
      const user = userEvent.setup()

      await user.type(await within(sheet).findByRole('textbox', { name: 'Comment' }), 'Root note')
      await user.click(within(sheet).getByRole('button', { name: 'Send comment' }))
      await waitFor(() => expect(host.count('dart.addComment')).toBe(1))
      expect(await within(sheet).findByText('Root note')).toBeTruthy()

      await user.click(within(sheet).getAllByRole('button', { name: 'Reply' })[0])
      await user.type(within(sheet).getByRole('textbox', { name: 'Comment' }), 'Reply note')
      await user.click(within(sheet).getByRole('button', { name: 'Send comment' }))
      await waitFor(() => expect(host.count('dart.addComment')).toBe(2))
      expect(await within(sheet).findByText('Reply note')).toBeTruthy()

      const bodies = host.requests
        .filter(({ method }) => method === 'dart.addComment')
        .map(({ params }) => params)
      expect(bodies[0]).toEqual({ taskId: SOURCE.id, text: 'Root note' })
      expect(bodies[1]).toEqual({
        taskId: SOURCE.id,
        text: 'Reply note',
        parentId: SEED_COMMENT.id
      })
    })
  }
)

describe.each(TRANSPORTS)('a host without dart.provider.v1 over the $name', (transport) => {
  it('shows the update-required state and receives no dart.* request', async () => {
    const host = transport.open({ providerV1: false })
    renderPage()

    expect(await screen.findByText('Update the remote Orca server to use Dart.')).toBeTruthy()
    await act(async () => {})
    expect(host.requests).toEqual([])
    expect(screen.queryByRole('textbox', { name: 'Comment' })).toBeNull()
  })
})
