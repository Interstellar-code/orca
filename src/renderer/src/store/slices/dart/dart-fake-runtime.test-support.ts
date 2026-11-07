/* eslint-disable max-lines -- Why: one fake host keeps list paging, saved views and write faults together so every Dart test shares one behavior surface. */
import { vi } from 'vitest'
import { DART_BOARD_RUNTIME_CAPABILITY } from '../../../../../shared/dart/dart-capabilities'
import {
  DART_SAVED_VIEWS_RUNTIME_CAPABILITY,
  mutateDartSavedViewState,
  type DartSavedView,
  type DartSavedViewMutation,
  type DartSavedViewState
} from '../../../../../shared/dart/dart-saved-views'
import type {
  DartComment,
  DartConnectionStatus,
  DartTask
} from '../../../../../shared/dart/dart-types'
import { createCompatibleRuntimeStatusResponse } from '@/runtime/runtime-compatibility-test-fixture'
import { clearRuntimeCompatibilityCacheForTests } from '@/runtime/runtime-rpc-client'

type Failure = { ok: false; error: string; errorCode?: string; outcome?: 'notApplied' | 'unknown' }
type RpcParams = {
  taskId?: string
  updates?: Record<string, unknown>
  text?: string
  parentId?: string
  title?: string
  status?: string
  tag?: string
  priority?: string
  dartboard?: string
  assignee?: string
  assigneeId?: string
  isCompleted?: boolean
  offset?: number
  limit?: number
  order?: string
  /** `ui.mutateDartSavedViews` sends the mutation itself as its params. */
  kind?: string
  view?: DartSavedView
  id?: string
  name?: string
}

const RATE_LIMITED: Failure = {
  ok: false,
  error: 'Dart rate limit reached.',
  errorCode: 'dart.rateLimited'
}
const DEFAULT_PAGE_SIZE = 100
const MAX_PAGE_SIZE = 250

const SORT_KEYS: Record<string, (task: DartTask) => string | null | undefined> = {
  dartboard__order: (task) => task.dartboard,
  updated_at: (task) => task.updatedAt,
  created_at: (task) => task.createdAt,
  title: (task) => task.title,
  completed_at: (task) => task.completedAt
}

/** Rows without the sort field go last in both directions. */
function sortedBy(tasks: DartTask[], order: string | undefined): DartTask[] {
  const descending = order?.startsWith('-') ?? false
  const field = order?.replace(/^-/, '')
  if (!field || field === 'order') {
    return tasks
  }
  const key = SORT_KEYS[field]
  if (!key) {
    throw new Error(`fake Dart host cannot sort by ${field}`)
  }
  return [...tasks].sort((a, b) => {
    const x = key(a)
    const y = key(b)
    if (!x || !y) {
      return x ? -1 : y ? 1 : 0
    }
    return x === y ? 0 : (x < y ? -1 : 1) * (descending ? -1 : 1)
  })
}

function toSavedViewMutation(params: RpcParams): DartSavedViewMutation {
  if (params.kind === 'save' && params.view) {
    return { kind: 'save', view: params.view }
  }
  if (params.kind === 'rename' && params.id !== undefined && params.name !== undefined) {
    return { kind: 'rename', id: params.id, name: params.name }
  }
  if (params.kind === 'delete' && params.id !== undefined) {
    return { kind: 'delete', id: params.id }
  }
  if (params.kind === 'select') {
    return { kind: 'select', id: params.id ?? null }
  }
  throw new Error(`fake Dart host cannot read saved view mutation ${params.kind}`)
}

/** One Dart workspace behind one host: writes change `tasks`, so reads show what the host really holds. */
export class FakeDartHost {
  tasks = new Map<string, DartTask>()
  requests: { method: string; params: RpcParams }[] = []
  /** Replies to the next writes without applying them. */
  refusals: Failure[] = []
  /** Applies the next writes, then loses the reply. */
  lostReplies: Failure[] = []
  /** Applies the next writes, then answers with a reply the client cannot read. */
  garbledReplies: object[] = []
  failReads = false
  /** Advertised as `dart.board.v1` and reported by `supportedDartFeatures`. */
  board = true
  /** Advertised as `dart.savedViews.v1`; without it the saved view methods do not exist. */
  savedViews = true
  savedViewState: DartSavedViewState = { views: [], activeViewId: null }
  /** Rows Dart sends but the host cannot map: dropped from `tasks`, still counted in `raw`. */
  unmappableIds = new Set<string>()
  /** Also drops the last N rows of every page as unmappable. */
  unmappablePerPage = 0
  /** Caps every page below the requested limit, as a host that sends short pages does. */
  maxRowsPerPage: number | null = null
  /** Replies to list requests the way a host without the `raw` counts does. */
  omitRaw = false
  /** Answers the Nth `dart.listTasks` request (1-based, over the host's life) with a failure. */
  private listFailures = new Map<number, Failure>()
  /** Names for `assigneeId` values other than the viewer's. */
  assigneeNames: Record<string, string> = {}
  connection: DartConnectionStatus = {
    connected: true,
    viewer: { id: 'user-a', name: 'Alex Example' }
  }
  /** The next write dies in transport after leaving the client. */
  transportError: Error | null = null
  private gates: { method: string; release: Promise<void> }[] = []

  addTask(task: DartTask): void {
    this.tasks.set(task.id, task)
  }

  /** The next request of `method` waits until the returned function runs. */
  hold(method: string): () => void {
    let release = (): void => {}
    this.gates.push({ method, release: new Promise((resolve) => (release = resolve)) })
    return () => release()
  }

  failListRequest(nth: number, failure: Failure = RATE_LIMITED): void {
    this.listFailures.set(nth, failure)
  }

  capabilities(): string[] {
    return [
      ...(this.board ? [DART_BOARD_RUNTIME_CAPABILITY] : []),
      ...(this.savedViews ? [DART_SAVED_VIEWS_RUNTIME_CAPABILITY] : [])
    ]
  }

  count(method: string): number {
    return this.requests.filter((request) => request.method === method).length
  }

  private write(apply: () => object): object {
    if (this.transportError) {
      const error = this.transportError
      this.transportError = null
      throw error
    }
    const refusal = this.refusals.shift()
    if (refusal) {
      return refusal
    }
    const reply = apply()
    return this.lostReplies.shift() ?? this.garbledReplies.shift() ?? reply
  }

  private update(params: RpcParams, changes: Partial<DartTask>): { ok: true; task: DartTask } {
    const current = this.tasks.get(params.taskId ?? '')
    if (!current) {
      throw new Error(`fake Dart host has no task ${params.taskId}`)
    }
    const task = { ...current, ...changes }
    this.tasks.set(task.id, task)
    return { ok: true, task }
  }

  /** A read answers with what the host holds when the request arrives, however late the reply lands. */
  async handle(method: string, params: RpcParams): Promise<object> {
    this.requests.push({ method, params })
    const readReply = this.read(method, params)
    const gateIndex = this.gates.findIndex((gate) => gate.method === method)
    if (gateIndex !== -1) {
      const [gate] = this.gates.splice(gateIndex, 1)
      await gate.release
    }
    return readReply ?? this.applyWrite(method, params)
  }

  private read(method: string, params: RpcParams): object | null {
    const failure: Failure = {
      ok: false,
      error: 'Failed to load Dart task.',
      errorCode: 'dart.loadFailed'
    }
    if (method === 'dart.status') {
      return this.connection
    }
    if (method === 'dart.connect') {
      return { ok: true, viewer: this.connection.viewer }
    }
    if (method === 'dart.disconnect') {
      return { ok: true }
    }
    if (method === 'dart.testConnection') {
      return { ok: true, viewer: this.connection.viewer }
    }
    if (method === 'dart.getTask') {
      const task = this.tasks.get(params.taskId ?? '')
      return this.failReads || !task ? failure : { ok: true, task }
    }
    if (method === 'dart.listTasks') {
      return this.list(params, failure)
    }
    if (this.savedViews && method === 'ui.getDartSavedViews') {
      return this.savedViewState
    }
    if (this.savedViews && method === 'ui.mutateDartSavedViews') {
      this.savedViewState = mutateDartSavedViewState(
        this.savedViewState,
        toSavedViewMutation(params)
      )
      return this.savedViewState
    }
    return null
  }

  private list(params: RpcParams, failure: Failure): object {
    const injected = this.listFailures.get(this.count('dart.listTasks'))
    if (injected) {
      return injected
    }
    if (this.failReads) {
      return failure
    }
    // A fixture with no assignee or dartboard matches any filter on them, as phase 2's fake did.
    const assignee = params.assigneeId ? this.assigneeName(params.assigneeId) : null
    const filtered = sortedBy(
      [...this.tasks.values()].filter(
        (task) =>
          (!params.status || task.status === params.status) &&
          (!params.tag || task.tags.includes(params.tag)) &&
          (!params.priority || task.priority === params.priority) &&
          (!params.dartboard ||
            !task.dartboard ||
            task.dartboard.toLowerCase() === params.dartboard.toLowerCase()) &&
          (!params.title || task.title.toLowerCase().includes(params.title.toLowerCase())) &&
          (assignee === null || !task.assignee || task.assignee === assignee) &&
          (params.isCompleted === undefined || Boolean(task.completedAt) === params.isCompleted)
      ),
      params.order
    )
    const offset = params.offset ?? 0
    const limit = Math.min(
      params.limit ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
      this.maxRowsPerPage ?? MAX_PAGE_SIZE
    )
    const rows = filtered.slice(offset, offset + limit)
    const keptRows = rows.slice(0, rows.length - Math.min(this.unmappablePerPage, rows.length))
    const tasks = keptRows
      .filter((task) => !this.unmappableIds.has(task.id))
      .map(({ description: _omitted, ...row }) => row)
    return {
      ok: true,
      tasks,
      totalCount: filtered.length - (rows.length - tasks.length),
      ...(this.omitRaw ? {} : { raw: { rowCount: rows.length, totalCount: filtered.length } })
    }
  }

  private assigneeName(assigneeId: string): string {
    const viewer = this.connection.viewer
    return viewer?.id === assigneeId ? viewer.name : (this.assigneeNames[assigneeId] ?? assigneeId)
  }

  private applyWrite(method: string, params: RpcParams): object {
    switch (method) {
      case 'dart.updateTask':
        return this.write(() => this.update(params, params.updates ?? {}))
      case 'dart.updateTaskDescription':
        return this.write(() => this.update(params, { description: 'patched description' }))
      case 'dart.addComment':
        return this.write(() => {
          const comment: DartComment = {
            id: 'cMnOpQrStUvW',
            taskId: params.taskId ?? '',
            htmlUrl: 'https://app.dartai.com/c/cMnOpQrStUvW',
            author: 'Alex Example',
            text: params.text ?? ''
          }
          return { ok: true, comment }
        })
      case 'dart.createTask':
        return this.write(() => {
          const task = {
            ...dartTaskFixture('nEwTaSk12345'),
            title: params.title ?? '',
            dartboard: params.dartboard,
            assignee: params.assignee ?? this.connection.viewer?.name
          }
          this.tasks.set(task.id, task)
          return { ok: true, task }
        })
      default:
        throw new Error(`fake Dart host has no ${method}`)
    }
  }
}

export function dartTaskFixture(id: string, overrides: Partial<DartTask> = {}): DartTask {
  return {
    id,
    title: 'Example task',
    htmlUrl: `https://app.dartai.com/t/${id}-example-task`,
    status: 'To-do',
    priority: 'Medium',
    tags: [],
    ...overrides
  }
}

/** Puts a fake host behind the real runtime client: `local` behind `window.api.dart`, the rest behind the RPC call. */
export function installFakeDartRuntime(): { host: (environmentId: string | null) => FakeDartHost } {
  clearRuntimeCompatibilityCacheForTests()
  const hosts = new Map<string, FakeDartHost>()
  const host = (environmentId: string | null): FakeDartHost => {
    const key = environmentId ?? 'local'
    const existing = hosts.get(key) ?? new FakeDartHost()
    hosts.set(key, existing)
    return existing
  }
  const savedViewBridge = {
    getDartSavedViews: () => host(null).handle('ui.getDartSavedViews', {}),
    mutateDartSavedViews: (mutation: RpcParams) =>
      host(null).handle('ui.mutateDartSavedViews', mutation)
  }
  const local =
    (method: string) =>
    (params: RpcParams = {}): Promise<object> =>
      host(null).handle(method, params)
  vi.stubGlobal('window', {
    api: {
      dart: {
        status: local('dart.status'),
        connect: local('dart.connect'),
        disconnect: local('dart.disconnect'),
        testConnection: local('dart.testConnection'),
        getTask: local('dart.getTask'),
        listTasks: local('dart.listTasks'),
        updateTask: local('dart.updateTask'),
        updateTaskDescription: local('dart.updateTaskDescription'),
        addComment: local('dart.addComment'),
        createTask: local('dart.createTask'),
        supportsWritesV2: async () => true,
        supportedDartFeatures: async () => ({ board: host(null).board })
      },
      ui: new Proxy(savedViewBridge, {
        // Other ui methods stay callable no-ops, as they were when `ui` was absent from the fake.
        get: (target, key) => (key in target ? target[key] : vi.fn(() => Promise.resolve(null)))
      }),
      runtimeEnvironments: {
        subscribe: vi.fn(),
        call: async (args: { selector: string; method: string; params: RpcParams }) => {
          if (args.method === 'status.get') {
            const reply = createCompatibleRuntimeStatusResponse(args.selector)
            const advertised = (reply.result.capabilities ?? []).filter(
              (capability) =>
                capability !== DART_BOARD_RUNTIME_CAPABILITY &&
                capability !== DART_SAVED_VIEWS_RUNTIME_CAPABILITY
            )
            return {
              ...reply,
              result: {
                ...reply.result,
                capabilities: [...advertised, ...host(args.selector).capabilities()]
              }
            }
          }
          return {
            id: 'rpc-result',
            ok: true,
            result: await host(args.selector).handle(args.method, args.params),
            _meta: { runtimeId: args.selector }
          }
        }
      }
    }
  })
  return { host }
}
