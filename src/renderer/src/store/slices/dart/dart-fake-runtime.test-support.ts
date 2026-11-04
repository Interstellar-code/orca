import { vi } from 'vitest'
import type { DartComment, DartTask } from '../../../../../shared/dart/dart-types'
import { createCompatibleRuntimeStatusResponse } from '@/runtime/runtime-compatibility-test-fixture'
import { clearRuntimeCompatibilityCacheForTests } from '@/runtime/runtime-rpc-client'

type Failure = { ok: false; error: string; errorCode?: string; outcome?: 'notApplied' | 'unknown' }
type RpcParams = {
  taskId?: string
  updates?: Record<string, unknown>
  text?: string
  title?: string
  status?: string
}

/** One Dart workspace behind one host: writes change `tasks`, so reads show what the host really holds. */
export class FakeDartHost {
  tasks = new Map<string, DartTask>()
  requests: { method: string; params: RpcParams }[] = []
  /** Replies to the next writes without applying them. */
  refusals: Failure[] = []
  /** Applies the next writes, then loses the reply. */
  lostReplies: Failure[] = []
  failReads = false
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

  count(method: string): number {
    return this.requests.filter((request) => request.method === method).length
  }

  private write(apply: () => object): object {
    const refusal = this.refusals.shift()
    if (refusal) {
      return refusal
    }
    const reply = apply()
    return this.lostReplies.shift() ?? reply
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
    const failure = { ok: false, error: 'Failed to load Dart task.', errorCode: 'dart.loadFailed' }
    if (method === 'dart.getTask') {
      const task = this.tasks.get(params.taskId ?? '')
      return this.failReads || !task ? failure : { ok: true, task }
    }
    if (method === 'dart.listTasks') {
      const tasks = [...this.tasks.values()]
        .filter((task) => !params.status || task.status === params.status)
        .map(({ description: _omitted, ...row }) => row)
      return this.failReads ? failure : { ok: true, tasks, totalCount: tasks.length }
    }
    return null
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
          const task = { ...dartTaskFixture('nEwTaSk12345'), title: params.title ?? '' }
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
  const local =
    (method: string) =>
    (params: RpcParams = {}): Promise<object> =>
      host(null).handle(method, params)
  vi.stubGlobal('window', {
    api: {
      dart: {
        getTask: local('dart.getTask'),
        listTasks: local('dart.listTasks'),
        updateTask: local('dart.updateTask'),
        updateTaskDescription: local('dart.updateTaskDescription'),
        addComment: local('dart.addComment'),
        createTask: local('dart.createTask'),
        supportsWritesV2: async () => true
      },
      runtimeEnvironments: {
        subscribe: vi.fn(),
        call: async (args: { selector: string; method: string; params: RpcParams }) => {
          if (args.method === 'status.get') {
            return createCompatibleRuntimeStatusResponse(args.selector)
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
