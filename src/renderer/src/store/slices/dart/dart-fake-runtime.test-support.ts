import { vi } from 'vitest'
import {
  DART_BOARD_RUNTIME_CAPABILITY,
  DART_RELATIONSHIPS_RUNTIME_CAPABILITY
} from '../../../../../shared/dart/dart-capabilities'
import {
  DART_SAVED_VIEWS_RUNTIME_CAPABILITY,
  mutateDartSavedViewState,
  type DartSavedViewState
} from '../../../../../shared/dart/dart-saved-views'
import type {
  DartComment,
  DartConnectionStatus,
  DartTask
} from '../../../../../shared/dart/dart-types'
import { createCompatibleRuntimeStatusResponse } from '@/runtime/runtime-compatibility-test-fixture'
import { clearRuntimeCompatibilityCacheForTests } from '@/runtime/runtime-rpc-client'
import { planBlockerWrite, selectFakeListRows } from './dart-fake-relationships.test-support'
import type { Failure, RpcParams } from './dart-fake-rpc-params.test-support'
import { toSavedViewMutation } from './dart-fake-saved-views.test-support'
import { pageFakeDartTasks } from './dart-fake-task-paging.test-support'

const RATE_LIMITED: Failure = {
  ok: false,
  error: 'Dart rate limit reached.',
  errorCode: 'dart.rateLimited'
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
  /** Advertised as `dart.relationships.v1`; off by default so only tests that need links turn it on. */
  relationships = false
  /** What `dart.updateTaskBlockers` sent to Dart, in order, as `GET /tasks/<id>` and `PUT /tasks/<id>`. */
  dartCalls: string[] = []
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
      ...(this.savedViews ? [DART_SAVED_VIEWS_RUNTIME_CAPABILITY] : []),
      ...(this.relationships ? [DART_RELATIONSHIPS_RUNTIME_CAPABILITY] : [])
    ]
  }

  count(method: string): number {
    return this.requests.filter((request) => request.method === method).length
  }

  requestsOf(method: string): RpcParams[] {
    return this.requests.filter((request) => request.method === method).map(({ params }) => params)
  }

  private write(apply: () => object, onSent: () => void = () => {}): object {
    if (this.transportError) {
      const error = this.transportError
      this.transportError = null
      throw error
    }
    onSent()
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
    const rows = selectFakeListRows(this.tasks.values(), params)
    if (!Array.isArray(rows)) {
      return rows
    }
    return pageFakeDartTasks(rows, params, {
      assignee: params.assigneeId ? this.assigneeName(params.assigneeId) : null,
      unmappableIds: this.unmappableIds,
      unmappablePerPage: this.unmappablePerPage,
      maxRowsPerPage: this.maxRowsPerPage,
      omitRaw: this.omitRaw
    })
  }

  private assigneeName(assigneeId: string): string {
    const viewer = this.connection.viewer
    return viewer?.id === assigneeId ? viewer.name : (this.assigneeNames[assigneeId] ?? assigneeId)
  }

  private updateBlockers(params: RpcParams): object {
    const plan = planBlockerWrite(params, this.tasks, this.failReads, this.dartCalls)
    if ('failure' in plan) {
      return plan.failure
    }
    return this.write(
      () => this.update(params, plan.changes),
      () => this.dartCalls.push(`PUT /tasks/${plan.taskId}`)
    )
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
      case 'dart.updateTaskBlockers':
        if (!this.relationships) {
          throw new Error(`fake Dart host has no ${method}`)
        }
        return this.updateBlockers(params)
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
        updateTaskBlockers: local('dart.updateTaskBlockers'),
        addComment: local('dart.addComment'),
        createTask: local('dart.createTask'),
        supportsWritesV2: async () => true,
        supportedDartFeatures: async () => ({
          board: host(null).board,
          relationships: host(null).relationships
        })
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
                capability !== DART_RELATIONSHIPS_RUNTIME_CAPABILITY &&
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
