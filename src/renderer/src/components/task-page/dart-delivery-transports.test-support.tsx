import { vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import {
  DART_PROVIDER_RUNTIME_CAPABILITY,
  DART_WRITES_V2_RUNTIME_CAPABILITY
} from '../../../../shared/dart/dart-capabilities'
import type { DartTask, DartWorkspaceConfig } from '../../../../shared/dart/dart-types'
import { useAppStore } from '@/store'
import {
  dartTaskFixture,
  FakeDartHost,
  installFakeDartRuntime
} from '@/store/slices/dart/dart-fake-runtime.test-support'
import { createWebDartApi } from '@/web/preload-api/web-dart-api'

export const VIEWER = { id: 'user-a', name: 'Alex Example' }
const CONFIG: DartWorkspaceConfig = {
  dartboards: ['Board A', 'Board B'],
  statuses: ['To-do', 'Doing', 'Done'],
  types: [],
  tags: ['search', 'backend'],
  priorities: ['High', 'Medium', 'Low'],
  sizes: ['1', '3', '5'],
  assignees: [VIEWER.name, 'Sam Example']
}

type OpenOptions = {
  writesV2?: boolean
  providerV1?: boolean
  board?: boolean
  savedViews?: boolean
}

export type Transport = {
  name: string
  /** Seeds the page on a host that advertises exactly the capabilities `options` leaves on. */
  open(options?: OpenOptions): FakeDartHost
}

// The web client's only outbound seam: the test's `vi.mock` factories read it when a call arrives.
export const web: { host: FakeDartHost | null; capabilities: string[]; methodNotFound: boolean } = {
  host: null,
  capabilities: [],
  /** An older server has no `dart.*` methods at all. */
  methodNotFound: false
}

function sourceTask(id: string): DartTask {
  return dartTaskFixture(id, {
    title: 'Delivery task',
    status: 'To-do',
    priority: 'Medium',
    dartboard: 'Board A',
    assignee: VIEWER.name,
    description: 'Original description'
  })
}

// Write blocks and notices outlive a host switch by design, so every test gets its own task id.
export let SOURCE = sourceTask('delivTask000')
let nextEnv = 0
let runtime: ReturnType<typeof installFakeDartRuntime> | null = null

export const remoteCapabilities = new Map<string, string[]>()
export const probedSelectors: string[] = []

export function installDeliveryRuntime(): ReturnType<typeof installFakeDartRuntime> {
  runtime = installFakeDartRuntime()
  return runtime
}

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

function freshSource(): void {
  nextEnv += 1
  SOURCE = sourceTask(`delivTask${String(nextEnv).padStart(3, '0')}`)
}

function seedPage(environmentId: string | null): void {
  // The web client always reads as scope `local`, so a cache from an earlier test would answer for this host.
  useAppStore.setState({
    dartTaskCache: {},
    dartListCache: {},
    dartConfigCache: {},
    dartScopeMetaCache: {}
  })
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
    worktreeNavHistory: [],
    worktreeNavHistoryIndex: -1,
    dartStatus: { connected: false, viewer: null },
    dartStatusChecked: false,
    dartUpdateRequired: false,
    checkLinearConnection: vi.fn(() => Promise.resolve()),
    checkJiraConnection: vi.fn(() => Promise.resolve()),
    refreshPreflightStatus: vi.fn(() => Promise.resolve())
  })
}

function applyFlags(host: FakeDartHost, options: OpenOptions): void {
  host.board = options.board !== false
  host.savedViews = options.savedViews !== false
}

function capabilitiesOf(options: OpenOptions, host: FakeDartHost): string[] {
  return [
    ...(options.providerV1 === false ? [] : [DART_PROVIDER_RUNTIME_CAPABILITY]),
    ...(options.writesV2 === false ? [] : [DART_WRITES_V2_RUNTIME_CAPABILITY]),
    ...host.capabilities()
  ]
}

/** Another paired server with its own Dart workspace; `task` is the same id on every server. */
export function addRemote(options: OpenOptions = {}): {
  environmentId: string
  host: FakeDartHost
} {
  if (!runtime) {
    throw new Error('installDeliveryRuntime() must run before addRemote()')
  }
  nextEnv += 1
  const environmentId = `remote-env-${nextEnv}`
  const host = runtime.host(environmentId)
  applyFlags(host, options)
  remoteCapabilities.set(environmentId, capabilitiesOf(options, host))
  serveConfigAndComments(host)
  host.addTask(SOURCE)
  return { environmentId, host }
}

const DESKTOP_IPC = 'desktop IPC'

export const TRANSPORTS: Transport[] = [
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
      applyFlags(host, options)
      serveConfigAndComments(host)
      host.addTask(SOURCE)
      web.host = host
      web.capabilities = capabilitiesOf(options, host)
      web.methodNotFound = options.providerV1 === false
      Object.assign(window.api, { dart: createWebDartApi() })
      seedPage(null)
      return host
    }
  },
  {
    name: DESKTOP_IPC,
    open: (options = {}) => {
      if (!runtime) {
        throw new Error('installDeliveryRuntime() must run before open()')
      }
      freshSource()
      const host = runtime.host(null)
      applyFlags(host, options)
      serveConfigAndComments(host)
      host.addTask(SOURCE)
      const bridge = window.api.dart
      // The shared fake's local bridge has no config or comments methods; route them to the same host.
      Object.assign(window.api, {
        dart: {
          ...bridge,
          config: () => host.handle('dart.config', {}),
          listComments: (params: Parameters<FakeDartHost['handle']>[1]) =>
            host.handle('dart.listComments', params)
        }
      })
      seedPage(null)
      return host
    }
  }
]

/** The desktop bridge always supports writes v2 and a Dart provider, so those degraded hosts exist only over RPC and web. */
export const NETWORK_TRANSPORTS = TRANSPORTS.filter((transport) => transport.name !== DESKTOP_IPC)
