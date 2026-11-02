import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const callMock = vi.fn()

vi.mock('../runtime-client', async () => {
  class RuntimeClient {
    readonly isRemote = false
    call = callMock
    getCliStatus = vi.fn()
    openOrca = vi.fn()
  }

  // Error formatting uses instanceof, so preserve the production error classes.
  const { RuntimeClientError, RuntimeRpcFailureError } = await import('../runtime/types.js')

  return {
    RuntimeClient,
    RuntimeClientError,
    RuntimeRpcFailureError
  }
})

import { DART_PROVIDER_RUNTIME_CAPABILITY } from '../../shared/dart/dart-capabilities'
import { main } from '../index'
import { okFixture, queueFixtures } from '../test-fixtures'

const TASK_ID = 'abcdefghijkl'

const TASK = {
  id: TASK_ID,
  title: 'Fix login redirect',
  htmlUrl: `https://app.dartai.com/t/${TASK_ID}-fix-login-redirect`,
  status: 'In Progress',
  dartboard: 'Product/Backlog',
  type: 'Task',
  assignee: 'Ada',
  tags: ['bug'],
  priority: 'High',
  size: 'M'
}

function runtimeFixture(capabilities: string[] = [DART_PROVIDER_RUNTIME_CAPABILITY]) {
  return okFixture('req_status_get', { capabilities })
}

/** Envelopes the host actually returns for a dart.* method: `{ok: true, ...}` inside `result`. */
function dartFixture(id: string, result: Record<string, unknown>) {
  return okFixture(id, { ok: true, ...result })
}

function printedJson(): unknown {
  return JSON.parse(String(vi.mocked(console.log).mock.calls.at(-1)?.[0]))
}

describe('orca dart CLI', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    callMock.mockReset()
    process.env = { ...originalEnv }
    delete process.env.ORCA_WORKTREE_ID
    delete process.env.ORCA_TERMINAL_HANDLE
    delete process.env.ORCA_PAIRING_CODE
    delete process.env.ORCA_ENVIRONMENT
    process.exitCode = undefined
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('refuses a runtime without the Dart capability before any dart call', async () => {
    queueFixtures(callMock, runtimeFixture([]))

    await main(['dart', 'status', '--json'], '/tmp/repo')

    expect(process.exitCode).toBe(1)
    expect(callMock).toHaveBeenCalledTimes(1)
    expect(callMock).toHaveBeenCalledWith('status.get')
    expect(printedJson()).toMatchObject({
      ok: false,
      error: {
        code: 'incompatible_runtime',
        message: 'Update Orca on the execution host to use Dart.'
      }
    })
  })

  it('maps list filters onto dart.listTasks params', async () => {
    queueFixtures(
      callMock,
      runtimeFixture(),
      dartFixture('req_list', { tasks: [TASK], totalCount: 1 })
    )

    await main(
      [
        'dart',
        'list',
        '--status',
        'In Progress',
        '--dartboard',
        'Product/Backlog',
        '--tag',
        'bug',
        '--priority',
        'High',
        '--title',
        'login',
        '--text',
        'redirect',
        '--limit',
        '5',
        '--offset',
        '10',
        '--json'
      ],
      '/tmp/repo'
    )

    expect(callMock).toHaveBeenNthCalledWith(2, 'dart.listTasks', {
      assignee: undefined,
      dartboard: 'Product/Backlog',
      status: 'In Progress',
      tag: 'bug',
      priority: 'High',
      title: 'login',
      description: 'redirect',
      limit: 5,
      offset: 10
    })
    expect(printedJson()).toMatchObject({
      result: { ok: true, totalCount: 1, tasks: [TASK] }
    })
  })

  it('resolves --mine to the signed-in user id from dart.status', async () => {
    queueFixtures(
      callMock,
      runtimeFixture(),
      dartFixture('req_dart_status', { connected: true, viewer: { id: TASK_ID, name: 'Ada' } }),
      dartFixture('req_list', { tasks: [], totalCount: 0 })
    )

    await main(['dart', 'list', '--mine', '--json'], '/tmp/repo')

    expect(callMock).toHaveBeenNthCalledWith(3, 'dart.listTasks', {
      assigneeId: TASK_ID,
      assignee: undefined,
      dartboard: undefined,
      status: undefined,
      tag: undefined,
      priority: undefined,
      title: undefined,
      description: undefined,
      limit: undefined,
      offset: undefined
    })
  })

  it('rejects --mine with --assignee instead of sending both', async () => {
    queueFixtures(callMock, runtimeFixture())

    await main(['dart', 'list', '--mine', '--assignee', 'Ada', '--json'], '/tmp/repo')

    expect(process.exitCode).toBe(1)
    expect(printedJson()).toMatchObject({
      ok: false,
      error: { code: 'invalid_argument', message: 'Pass either --mine or --assignee, not both.' }
    })
  })

  it('rejects a --limit above the Dart page maximum', async () => {
    queueFixtures(callMock, runtimeFixture())

    await main(['dart', 'list', '--limit', '251', '--json'], '/tmp/repo')

    expect(process.exitCode).toBe(1)
    expect(printedJson()).toMatchObject({ ok: false, error: { code: 'invalid_argument' } })
    expect(callMock).toHaveBeenCalledTimes(1)
  })

  it('rejects filter flags Dart does not accept instead of returning everything', async () => {
    await main(['dart', 'list', '--search', 'login', '--json'], '/tmp/repo')

    expect(process.exitCode).toBe(1)
    expect(callMock).not.toHaveBeenCalled()
    expect(printedJson()).toMatchObject({ ok: false, error: { code: 'invalid_argument' } })
  })

  it('accepts a task URL for get and prints the task with its description', async () => {
    queueFixtures(
      callMock,
      runtimeFixture(),
      dartFixture('req_get', { task: { ...TASK, description: 'Steps to reproduce.' } })
    )

    await main(
      ['dart', 'get', `https://app.dartai.com/t/${TASK_ID}-fix-login-redirect`],
      '/tmp/repo'
    )

    expect(callMock).toHaveBeenNthCalledWith(2, 'dart.getTask', { taskId: TASK_ID })
    const output = String(vi.mocked(console.log).mock.calls.at(-1)?.[0])
    expect(output).toContain(`URL: ${TASK.htmlUrl}`)
    expect(output).toContain('Status: In Progress')
    expect(output).toContain('Tags: bug')
    expect(output).toContain('Steps to reproduce.')
  })

  it('rejects a task key instead of guessing a lookup', async () => {
    queueFixtures(callMock, runtimeFixture())

    await main(['dart', 'get', 'ABC-123', '--json'], '/tmp/repo')

    expect(process.exitCode).toBe(1)
    expect(printedJson()).toMatchObject({
      ok: false,
      error: {
        code: 'invalid_argument',
        message: expect.stringContaining('12-character Dart task id')
      }
    })
  })

  it('adds a comment with the task id and body', async () => {
    queueFixtures(
      callMock,
      runtimeFixture(),
      dartFixture('req_comment', {
        comment: {
          id: 'comment00001',
          taskId: TASK_ID,
          htmlUrl: `https://app.dartai.com/c/comment00001`,
          author: 'Ada',
          text: 'Fix is on staging'
        }
      })
    )

    await main(
      ['dart', 'comment', 'add', TASK_ID, '--body', 'Fix is on staging', '--json'],
      '/tmp/repo'
    )

    expect(callMock).toHaveBeenNthCalledWith(2, 'dart.addComment', {
      taskId: TASK_ID,
      text: 'Fix is on staging'
    })
  })

  it('creates a task with names and repeated tags', async () => {
    queueFixtures(callMock, runtimeFixture(), dartFixture('req_create', { task: TASK }))

    await main(
      [
        'dart',
        'create',
        '--title',
        'Fix login redirect',
        '--dartboard',
        'Product/Backlog',
        '--status',
        'To-do',
        '--tag',
        'bug',
        '--tag',
        'backend',
        '--json'
      ],
      '/tmp/repo'
    )

    expect(callMock).toHaveBeenNthCalledWith(2, 'dart.createTask', {
      title: 'Fix login redirect',
      dartboard: 'Product/Backlog',
      status: 'To-do',
      tags: ['bug', 'backend'],
      description: undefined,
      type: undefined,
      priority: undefined,
      assignee: undefined
    })
  })

  it('rejects a bare --tag before any Dart call', async () => {
    queueFixtures(callMock, runtimeFixture())

    await main(['dart', 'update', TASK_ID, '--tag', '--json'], '/tmp/repo')

    expect(process.exitCode).toBe(1)
    expect(callMock).toHaveBeenCalledTimes(1)
    expect(printedJson()).toMatchObject({
      ok: false,
      error: { code: 'invalid_argument', message: expect.stringContaining('requires a value') }
    })
  })

  it('clears every tag on an explicit empty --tag and dedupes repeated names', async () => {
    queueFixtures(callMock, runtimeFixture(), dartFixture('req_update', { task: TASK }))
    await main(['dart', 'update', TASK_ID, '--tag=', '--json'], '/tmp/repo')
    expect(callMock).toHaveBeenNthCalledWith(2, 'dart.updateTask', {
      taskId: TASK_ID,
      updates: expect.objectContaining({ tags: [] })
    })

    callMock.mockReset()
    vi.mocked(console.log).mockClear()
    queueFixtures(callMock, runtimeFixture(), dartFixture('req_update_dedupe', { task: TASK }))
    await main(
      ['dart', 'update', TASK_ID, '--tag', 'bug', '--tag', 'bug', '--tag', 'backend', '--json'],
      '/tmp/repo'
    )
    expect(callMock).toHaveBeenNthCalledWith(2, 'dart.updateTask', {
      taskId: TASK_ID,
      updates: expect.objectContaining({ tags: ['bug', 'backend'] })
    })
  })

  it('updates only the fields given, clearing a field given as null', async () => {
    queueFixtures(callMock, runtimeFixture(), dartFixture('req_update', { task: TASK }))

    await main(
      ['dart', 'update', TASK_ID, '--status', 'Done', '--priority', 'null', '--json'],
      '/tmp/repo'
    )

    expect(callMock).toHaveBeenNthCalledWith(2, 'dart.updateTask', {
      taskId: TASK_ID,
      updates: {
        status: 'Done',
        priority: null,
        title: undefined,
        description: undefined,
        assignee: undefined,
        tags: undefined
      }
    })
  })

  it('rejects an update with no changed field', async () => {
    queueFixtures(callMock, runtimeFixture())

    await main(['dart', 'update', TASK_ID, '--json'], '/tmp/repo')

    expect(process.exitCode).toBe(1)
    expect(printedJson()).toMatchObject({ ok: false, error: { code: 'invalid_argument' } })
    expect(callMock).toHaveBeenCalledTimes(1)
  })

  it("prints the host's error string with its dart.* error code", async () => {
    queueFixtures(
      callMock,
      runtimeFixture(),
      okFixture('req_get', {
        ok: false,
        error: 'Dart task not found.',
        errorCode: 'dart.taskNotFound'
      })
    )

    await main(['dart', 'get', TASK_ID, '--json'], '/tmp/repo')

    expect(process.exitCode).toBe(1)
    expect(printedJson()).toMatchObject({
      ok: false,
      error: { code: 'dart.taskNotFound', message: 'Dart task not found.' }
    })
  })

  it('reports a lost write reply as an unverified Dart change', async () => {
    const { RuntimeClientError } = await import('../runtime/types.js')
    queueFixtures(callMock, runtimeFixture())
    callMock.mockRejectedValueOnce(new RuntimeClientError('runtime_timeout', 'Runtime timed out.'))

    await main(['dart', 'update', TASK_ID, '--status', 'Done', '--json'], '/tmp/repo')

    expect(process.exitCode).toBe(1)
    expect(printedJson()).toMatchObject({
      ok: false,
      error: {
        code: 'dart_write_unverified',
        message: expect.stringContaining('may have been applied')
      }
    })
  })

  it('reports a lost create reply as an unverified Dart change', async () => {
    const { RuntimeClientError } = await import('../runtime/types.js')
    queueFixtures(callMock, runtimeFixture())
    callMock.mockRejectedValueOnce(
      new RuntimeClientError('runtime_connection_failed', 'Connection lost.')
    )

    await main(['dart', 'create', '--title', 'Fix login redirect', '--json'], '/tmp/repo')

    expect(process.exitCode).toBe(1)
    expect(printedJson()).toMatchObject({
      ok: false,
      error: {
        code: 'dart_write_unverified',
        message: expect.stringContaining('may have been applied')
      }
    })
  })

  it('lists config names for discovery', async () => {
    queueFixtures(
      callMock,
      runtimeFixture(),
      dartFixture('req_config', {
        config: {
          dartboards: ['Product/Backlog'],
          statuses: ['To-do', 'In Progress'],
          types: ['Task'],
          priorities: ['High'],
          tags: ['bug'],
          assignees: ['Ada'],
          sizes: ['M']
        }
      })
    )

    await main(['dart', 'config'], '/tmp/repo')

    const output = String(vi.mocked(console.log).mock.calls.at(-1)?.[0])
    expect(output).toContain('Dartboards: Product/Backlog')
    expect(output).toContain('Statuses: To-do, In Progress')
  })

  it('lists every dart subcommand in its help', async () => {
    await main(['dart', '--help'], '/tmp/repo')

    const output = String(vi.mocked(console.log).mock.calls.at(-1)?.[0])
    expect(output).toContain('orca dart')
    for (const command of ['status', 'config', 'list', 'get', 'comment', 'create', 'update']) {
      expect(output).toContain(command)
    }
  })
})
