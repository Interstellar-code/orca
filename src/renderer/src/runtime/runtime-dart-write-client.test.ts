// @vitest-environment happy-dom

import { createBrowserUuid } from '@/lib/browser-uuid'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DART_PROVIDER_RUNTIME_CAPABILITY,
  DART_WRITES_V2_RUNTIME_CAPABILITY
} from '../../../shared/dart/dart-capabilities'
import { DART_REQUEST_TEXT_MAX_BYTES } from '../../../shared/dart/dart-text-limits'
import { runtimeEnvironmentCallFailure } from '../../../main/ipc/runtime-environments/runtime-environment-call-failure'
import { serializeRemoteRuntimeRpcRequest } from '../../../shared/remote-runtime/remote-runtime-memory-limits'
import type { resolveEnvironment } from '../../../shared/runtime-environment-store'
import type { DartTask } from '../../../shared/dart/dart-types'
import {
  dartAddCommentForTarget,
  dartCreateTaskForTarget,
  dartSupportsWritesV2ForTarget,
  dartUpdateTaskDescriptionForTarget,
  dartUpdateTaskForTarget
} from './runtime-dart-write-client'
import { createCompatibleRuntimeStatusResponse } from './runtime-compatibility-test-fixture'
import { clearRuntimeCompatibilityCacheForTests } from './runtime-rpc-client'

const runtimeCall = vi.fn()
const updateTaskLocal = vi.fn()
const createTaskLocal = vi.fn()
const addCommentLocal = vi.fn()
const patchLocal = vi.fn()
const supportsWritesV2Local = vi.fn()
const TASK_ID = 'aB3dE5gH7jK9'

const remote = { kind: 'environment', environmentId: 'remote-dart' } as const

function task(overrides: Partial<DartTask>): DartTask {
  return {
    id: 'aB3dE5gH7jK9',
    title: 'Example task',
    htmlUrl: 'https://app.dartai.com/t/aB3dE5gH7jK9-example-task',
    tags: [],
    ...overrides
  }
}

function mockRemote(options: {
  withDartCapability: boolean
  withWritesV2?: boolean
  reply?: unknown
  onWrite?: (args: { method: string; params: unknown }) => unknown
}): void {
  runtimeCall.mockImplementation(async (args: { method: string; params: unknown }) => {
    if (args.method === 'status.get') {
      const status = createCompatibleRuntimeStatusResponse('remote-dart')
      // The compatible status already advertises every current capability, Dart included.
      const others = (status.result.capabilities ?? []).filter(
        (capability) => capability !== DART_PROVIDER_RUNTIME_CAPABILITY
      )
      const withProvider = options.withDartCapability
        ? [...others, DART_PROVIDER_RUNTIME_CAPABILITY]
        : others
      const v2Free = withProvider.filter(
        (capability) => capability !== DART_WRITES_V2_RUNTIME_CAPABILITY
      )
      status.result.capabilities = options.withWritesV2 === false ? v2Free : withProvider
      return status
    }
    if (options.onWrite) {
      return options.onWrite(args)
    }
    return {
      id: 'rpc-result',
      ok: true,
      result: options.reply,
      _meta: { runtimeId: 'remote-dart' }
    }
  })
}

beforeEach(() => {
  clearRuntimeCompatibilityCacheForTests()
  vi.stubGlobal('window', {
    api: {
      dart: {
        updateTask: updateTaskLocal,
        createTask: createTaskLocal,
        addComment: addCommentLocal,
        updateTaskDescription: patchLocal,
        supportsWritesV2: supportsWritesV2Local
      },
      runtimeEnvironments: { call: runtimeCall, subscribe: vi.fn() }
    }
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  runtimeCall.mockReset()
  for (const mock of [
    updateTaskLocal,
    createTaskLocal,
    addCommentLocal,
    patchLocal,
    supportsWritesV2Local
  ]) {
    mock.mockReset()
  }
})

const okTask = () => ({ ok: true, task: task({ id: TASK_ID }) })
const okEnvelope = (result: unknown) => ({
  id: 'rpc-result',
  ok: true,
  result,
  _meta: { runtimeId: 'remote-dart' }
})
const writeMethods = () =>
  runtimeCall.mock.calls.map(([call]) => call.method).filter((m: string) => m.startsWith('dart.'))

describe('runtime Dart client writes', () => {
  it('calls the local bridge for a local target', async () => {
    updateTaskLocal.mockResolvedValue(okTask())

    await expect(
      dartUpdateTaskForTarget({ kind: 'local' }, TASK_ID, { status: 'Doing' })
    ).resolves.toMatchObject({ ok: true })

    expect(updateTaskLocal).toHaveBeenCalledWith({ taskId: TASK_ID, updates: { status: 'Doing' } })
  })

  it('calls RPC with the write timeout on a remote target that has the capabilities', async () => {
    mockRemote({ withDartCapability: true, onWrite: () => okEnvelope(okTask()) })

    await dartUpdateTaskForTarget(remote, TASK_ID, { size: 'M' })

    expect(runtimeCall).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: 'dart.updateTask',
        params: { taskId: TASK_ID, updates: { size: 'M' } },
        timeoutMs: 100_000
      })
    )
  })

  it('gives the update-required failure and sends nothing to a remote host without dart.provider.v1', async () => {
    mockRemote({ withDartCapability: false })

    const result = await dartCreateTaskForTarget(remote, { title: 'x' })

    expect(result).toMatchObject({ ok: false, outcome: 'notApplied' })
    expect(result.ok === false && result.error).toContain('Update')
    expect(writeMethods()).toEqual([])
  })

  it('sends a status update to a host without dart.writes.v2 but refuses size, date-only and patch', async () => {
    mockRemote({
      withDartCapability: true,
      withWritesV2: false,
      onWrite: () => okEnvelope(okTask())
    })

    await expect(
      dartUpdateTaskForTarget(remote, TASK_ID, { status: 'Doing' })
    ).resolves.toMatchObject({ ok: true })
    expect(writeMethods()).toEqual(['dart.updateTask'])
    runtimeCall.mockClear()

    const refusals = [
      await dartUpdateTaskForTarget(remote, TASK_ID, { size: 3 }),
      await dartUpdateTaskForTarget(remote, TASK_ID, { dueAt: '2026-11-30' }),
      await dartCreateTaskForTarget(remote, { title: 'x', size: null, startAt: '2026-11-01' }),
      await dartUpdateTaskDescriptionForTarget(remote, {
        taskId: TASK_ID,
        updates: [{ type: 'delete', oldText: 'a' }]
      })
    ]

    for (const refusal of refusals) {
      expect(refusal).toMatchObject({ ok: false, outcome: 'notApplied' })
      expect(refusal.ok === false && refusal.error).toContain('edit this field')
    }
    expect(writeMethods()).toEqual([])
  })

  it('probes a local web client through supportsWritesV2 and sends nothing without it', async () => {
    supportsWritesV2Local.mockResolvedValue(false)

    const results = [
      await dartUpdateTaskForTarget({ kind: 'local' }, TASK_ID, { size: 3 }),
      await dartUpdateTaskForTarget({ kind: 'local' }, TASK_ID, { dueAt: '2026-11-30' }),
      await dartUpdateTaskDescriptionForTarget(
        { kind: 'local' },
        {
          taskId: TASK_ID,
          updates: [{ type: 'delete', oldText: 'a' }]
        }
      )
    ]

    expect(results.every((r) => !r.ok && r.outcome === 'notApplied')).toBe(true)
    expect(updateTaskLocal).not.toHaveBeenCalled()
    expect(patchLocal).not.toHaveBeenCalled()
    expect(supportsWritesV2Local).toHaveBeenCalled()
  })

  it('treats a rejected writes.v2 probe (host switched or missing) as no support and sends nothing', async () => {
    supportsWritesV2Local.mockRejectedValue(new Error('environment changed'))

    await expect(dartSupportsWritesV2ForTarget({ kind: 'local' })).resolves.toBe(false)
    await expect(
      dartUpdateTaskForTarget({ kind: 'local' }, TASK_ID, { size: 3 })
    ).resolves.toMatchObject({ ok: false, outcome: 'notApplied' })
    expect(updateTaskLocal).not.toHaveBeenCalled()
  })

  it('refuses an over-limit description or patch locally and sends nothing', async () => {
    supportsWritesV2Local.mockResolvedValue(true)
    const big = 'x'.repeat(DART_REQUEST_TEXT_MAX_BYTES + 1)

    const created = await dartCreateTaskForTarget(
      { kind: 'local' },
      { title: 't', description: big }
    )
    const patched = await dartUpdateTaskDescriptionForTarget(
      { kind: 'local' },
      {
        taskId: TASK_ID,
        updates: [{ type: 'replace', oldText: 'a', newText: big }]
      }
    )
    const commented = await dartAddCommentForTarget(
      { kind: 'local' },
      { taskId: TASK_ID, text: 'x'.repeat(50_001) }
    )

    for (const result of [created, patched, commented]) {
      expect(result).toMatchObject({ ok: false, outcome: 'notApplied' })
      expect(result.ok === false && result.error).toContain('too')
    }
    expect(createTaskLocal).not.toHaveBeenCalled()
    expect(patchLocal).not.toHaveBeenCalled()
    expect(addCommentLocal).not.toHaveBeenCalled()
  })

  describe('outcome', () => {
    it('is unknown when the local call rejects after dispatch, and the write is not retried', async () => {
      updateTaskLocal.mockRejectedValue(new Error('ipc closed'))

      await expect(
        dartUpdateTaskForTarget({ kind: 'local' }, TASK_ID, { status: 'Doing' })
      ).resolves.toMatchObject({ ok: false, outcome: 'unknown', error: 'ipc closed' })
      expect(updateTaskLocal).toHaveBeenCalledTimes(1)
    })

    it('is unknown when the RPC call times out after dispatch', async () => {
      mockRemote({
        withDartCapability: true,
        onWrite: () => {
          throw new Error('Request timed out: dart.addComment')
        }
      })

      await expect(
        dartAddCommentForTarget(remote, { taskId: TASK_ID, text: 'hi' })
      ).resolves.toMatchObject({ ok: false, outcome: 'unknown' })
      expect(writeMethods()).toEqual(['dart.addComment'])
    })

    it('is unknown when the web call throws', async () => {
      patchLocal.mockRejectedValue(Object.assign(new Error('socket closed'), { code: 'timeout' }))
      supportsWritesV2Local.mockResolvedValue(true)

      await expect(
        dartUpdateTaskDescriptionForTarget(
          { kind: 'local' },
          {
            taskId: TASK_ID,
            updates: [{ type: 'delete', oldText: 'a' }]
          }
        )
      ).resolves.toMatchObject({ ok: false, outcome: 'unknown' })
    })

    it('keeps a host outcome and classifies older-host replies conservatively', async () => {
      const failure = (errorCode: string, outcome?: string) => ({
        ok: false,
        error: 'x',
        errorCode,
        ...(outcome ? { outcome } : {})
      })
      const outcomeOf = async (reply: unknown) => {
        updateTaskLocal.mockResolvedValueOnce(reply)
        const result = await dartUpdateTaskForTarget({ kind: 'local' }, TASK_ID, { status: 'x' })
        return result.ok ? 'ok' : result.outcome
      }

      expect(await outcomeOf(failure('dart.updateFailed'))).toBe('unknown')
      expect(await outcomeOf(failure('dart.badRequest'))).toBe('notApplied')
      expect(await outcomeOf(failure('dart.descriptionPatchRefused'))).toBe('notApplied')
      expect(await outcomeOf(failure('dart.updateFailed', 'notApplied'))).toBe('notApplied')
      expect(await outcomeOf(failure('dart.badRequest', 'unknown'))).toBe('unknown')
    })

    it('maps a serializer refusal through the real callRuntimeRpc path to notApplied, and any other post-dispatch exception to unknown', async () => {
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the failure builder reads only runtimeId from the environment.
      const environment = { runtimeId: 'remote-dart' } as ReturnType<typeof resolveEnvironment>
      let hostReached = 0
      mockRemote({
        withDartCapability: true,
        onWrite: (args) => {
          try {
            serializeRemoteRuntimeRpcRequest({
              requestId: createBrowserUuid(),
              deviceToken: 'dvt_'.padEnd(64, 'a'),
              method: args.method,
              params: args.params
            })
          } catch (error) {
            const failure = runtimeEnvironmentCallFailure(environment, args.method, error)
            if (failure) {
              return failure
            }
            throw error
          }
          hostReached += 1
          return okEnvelope(okTask())
        }
      })

      // 200k control characters pass the 256 KB text cap but serialize to about 1.2 MB.
      const escapeHeavy = '\u0001'.repeat(200_000)
      const refused = await dartCreateTaskForTarget(remote, {
        title: 't',
        description: escapeHeavy
      })

      expect(refused).toMatchObject({ ok: false, outcome: 'notApplied' })
      expect(refused.ok === false && refused.error).toContain('too large')
      expect(hostReached).toBe(0)

      mockRemote({
        withDartCapability: true,
        onWrite: () => {
          throw new Error('boom')
        }
      })
      await expect(dartCreateTaskForTarget(remote, { title: 't' })).resolves.toMatchObject({
        ok: false,
        outcome: 'unknown'
      })
    })
  })

  it('blanks an untrusted htmlUrl in a write reply and keeps the task', async () => {
    updateTaskLocal.mockResolvedValue({
      ok: true,
      task: task({ id: TASK_ID, htmlUrl: 'https://evil.example/t/x' })
    })

    const result = await dartUpdateTaskForTarget({ kind: 'local' }, TASK_ID, { status: 'x' })

    expect(result.ok && result.task).toMatchObject({ id: TASK_ID, htmlUrl: '' })
  })
})
