// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DartComment } from '../../../../../shared/dart/dart-types'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import { DART_WRITES_V2_RUNTIME_CAPABILITY } from '../../../../../shared/dart/dart-capabilities'
import { createCompatibleRuntimeStatusResponse } from '@/runtime/runtime-compatibility-test-fixture'
import { dartSupportsWritesV2ForTarget } from '@/runtime/runtime-dart-write-client'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { useAppStore } from '@/store'
import {
  dartTaskFixture,
  installFakeDartRuntime,
  type FakeDartHost
} from '@/store/slices/dart/dart-fake-runtime.test-support'
import { getDartReadScope } from '@/store/slices/dart/dart-read-coordination'
import { bumpDartEpochs } from '@/store/slices/dart/dart-task-identity'
import { useDartTaskDetailData } from './use-dart-task-detail-data'

const viewer = { id: 'user-a', name: 'Alex Example' }
const CONFIG = (name: string) => ({
  dartboards: [name],
  statuses: ['To-do', 'Done'],
  types: [],
  tags: [],
  priorities: [],
  sizes: [],
  assignees: []
})

let runtime: ReturnType<typeof installFakeDartRuntime>
let nextHost = 0
const realWindow = window

function commentFixture(id: string, text: string): DartComment {
  return {
    id,
    taskId: 'unused',
    htmlUrl: `https://app.dartai.com/c/${id}`,
    author: 'Alex Example',
    text
  }
}

function isCommentReply(reply: unknown): reply is { comment: DartComment } {
  return typeof reply === 'object' && reply !== null && 'comment' in reply
}

/** The shared fake has no comments or config, so this file answers those two methods itself. */
function withCommentsAndConfig(host: FakeDartHost, boardName: string) {
  const comments: DartComment[] = []
  const handle = host.handle.bind(host)
  host.handle = async (method, params) => {
    if (method === 'dart.config') {
      host.requests.push({ method, params })
      return { ok: true, config: CONFIG(boardName) }
    }
    if (method === 'dart.listComments') {
      const snapshot = [...comments]
      const reply = { ok: true, comments: snapshot, totalCount: snapshot.length }
      // `handle` runs the hold, then fails on the unknown method; only the hold is wanted.
      await handle(method, params).catch(() => {})
      return reply
    }
    const reply = await handle(method, params)
    if (method === 'dart.addComment' && isCommentReply(reply)) {
      comments.push(reply.comment)
    }
    return reply
  }
  return comments
}

/** The fake's hosts all advertise every capability; this one answers as a server without `dart.writes.v2`. */
function withoutWritesV2(environmentId: string): void {
  const { call } = window.api.runtimeEnvironments
  Object.assign(window.api.runtimeEnvironments, {
    call: (args: Parameters<typeof call>[0]) => {
      if (args.method !== 'status.get' || args.selector !== environmentId) {
        return call(args)
      }
      const reply = createCompatibleRuntimeStatusResponse(environmentId)
      return Promise.resolve({
        ...reply,
        result: {
          ...reply.result,
          capabilities: reply.result.capabilities?.filter(
            (capability) => capability !== DART_WRITES_V2_RUNTIME_CAPABILITY
          )
        }
      })
    }
  })
}

function sourceContext(env: string, userId: string | null = viewer.id): TaskSourceContext {
  return {
    kind: 'task-source',
    provider: 'dart',
    projectId: 'project-1',
    hostId: `runtime:${env}`,
    providerIdentity: userId ? { provider: 'dart', userId } : null
  }
}

/** The page on a host of its own, with the detail opened in its explicit scope. */
function openDetail(options: { detailEnv?: string; userId?: string | null } = {}) {
  nextHost += 1
  const env = `detail-host-${nextHost}`
  const taskId = `taskDetail${String(nextHost).padStart(3, '0')}`
  const detailEnv = options.detailEnv ?? env
  const host = runtime.host(detailEnv)
  const comments = withCommentsAndConfig(host, `Board of ${detailEnv}`)
  const row = dartTaskFixture(taskId)
  host.addTask(dartTaskFixture(taskId, { description: 'Original description' }))
  const settings = { ...useAppStore.getState().settings!, activeRuntimeEnvironmentId: env }
  useAppStore.setState({
    settings,
    dartStatus: { connected: true, viewer },
    dartStatusChecked: true,
    dartStatusContextKey: getDartReadScope(settings).contextKey
  })
  const context = sourceContext(
    detailEnv,
    options.userId === undefined ? viewer.id : options.userId
  )
  const mount = () =>
    renderHook(() =>
      useDartTaskDetailData(
        row,
        context,
        useAppStore((s) => getProviderRuntimeContextKey(s.settings))
      )
    )
  return { env, taskId, host, comments, row, context, mount }
}

async function openReady(options?: Parameters<typeof openDetail>[0]) {
  const page = openDetail(options)
  const hook = page.mount()
  await waitFor(() => expect(hook.result.current.full.status).toBe('ready'))
  await waitFor(() => expect(hook.result.current.comments.status).toBe('ready'))
  return { ...page, hook }
}

beforeEach(() => {
  runtime = installFakeDartRuntime()
  // The fake stubs a bare `window`, which React DOM cannot render into, so its API moves onto the real one.
  const api = window.api
  vi.stubGlobal('window', realWindow)
  Object.assign(realWindow, { api })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('useDartTaskDetailData', () => {
  it('reads config, capability and writes through the detail’s scope, not the page’s', async () => {
    const pageOnly = `page-only-${nextHost}`
    const page = openDetail({ detailEnv: pageOnly, userId: 'remote-user' })
    const { host, taskId, env } = page
    host.connection = {
      connected: true,
      viewer: { id: 'remote-user', name: 'Remote Viewer', email: 'remote@example.com' }
    }
    const hook = page.mount()
    await waitFor(() => expect(hook.result.current.full.status).toBe('ready'))

    await waitFor(() =>
      expect(hook.result.current.config?.dartboards).toEqual([`Board of ${pageOnly}`])
    )
    await waitFor(() => expect(hook.result.current.supportsWritesV2).toBe(true))

    await act(async () => {
      await hook.result.current.onUpdate({ status: 'Done' }, { status: 'Done' })
    })

    expect(host.tasks.get(taskId)?.status).toBe('Done')
    expect(runtime.host(env).count('dart.updateTask')).toBe(0)
    expect(runtime.host(env).count('dart.config')).toBe(0)
    await waitFor(() => expect(hook.result.current.viewerName).toBe('Remote Viewer'))
    expect(hook.result.current.viewerEmail).toBe('remote@example.com')
  })

  it('probes dart.writes.v2 on the detail’s host, whatever the page’s host has', async () => {
    const onDetailHost = openDetail({ detailEnv: `probe-has-${nextHost}` })
    withoutWritesV2(onDetailHost.env)
    const supported = onDetailHost.mount()
    await waitFor(() => expect(supported.result.current.supportsWritesV2).toBe(true))
    cleanup()

    const detailEnv = `probe-lacks-${nextHost}`
    const onPageHost = openDetail({ detailEnv })
    withoutWritesV2(detailEnv)
    const unsupported = onPageHost.mount()
    await waitFor(() => expect(unsupported.result.current.config).not.toBeNull())
    await act(async () => {
      await dartSupportsWritesV2ForTarget({ kind: 'environment', environmentId: detailEnv })
    })
    expect(unsupported.result.current.supportsWritesV2).toBe(false)
  })

  it('names the viewer only for the page’s own environment and account', async () => {
    const same = await openReady()
    expect(same.hook.result.current.viewerName).toBe(viewer.name)
    cleanup()

    const otherAccount = await openReady({ userId: 'user-b' })
    expect(otherAccount.hook.result.current.viewerName).toBeNull()
  })

  it('refreshes the detail host viewer when retrying after status was unavailable', async () => {
    const page = openDetail({ detailEnv: `retry-viewer-${nextHost}`, userId: 'remote-user' })
    page.host.connection = { connected: true, viewer: null }
    const hook = page.mount()
    await waitFor(() => expect(page.host.count('dart.status')).toBeGreaterThan(0))
    expect(hook.result.current.viewerName).toBeNull()

    page.host.connection = {
      connected: true,
      viewer: { id: 'remote-user', name: 'Recovered', email: 'recovered@example.com' }
    }
    act(() => hook.result.current.retry())
    await waitFor(() => expect(hook.result.current.viewerName).toBe('Recovered'))
    expect(hook.result.current.viewerEmail).toBe('recovered@example.com')
  })

  it('shows an edit at once, marks it pending and then shows what Dart returned', async () => {
    const { hook, host } = await openReady()
    const release = host.hold('dart.updateTask')

    let write: Promise<unknown> = Promise.resolve()
    act(() => {
      write = hook.result.current.onUpdate({ status: 'Done' }, { status: 'Done' })
    })

    expect(hook.result.current.task?.status).toBe('Done')
    expect(hook.result.current.pendingFields.has('status')).toBe(true)

    await act(async () => {
      release()
      await write
    })

    expect(hook.result.current.task?.status).toBe('Done')
    expect(hook.result.current.pendingFields.size).toBe(0)
    expect(hook.result.current.notice).toBeNull()
  })

  it('rolls a refused write back with a notice and does not retry a rate limit', async () => {
    const { hook, host } = await openReady()
    host.refusals.push({
      ok: false,
      error: 'Slow down',
      errorCode: 'dart.rateLimited',
      outcome: 'notApplied'
    })

    let result: Awaited<ReturnType<typeof hook.result.current.onUpdate>> | undefined
    await act(async () => {
      result = await hook.result.current.onUpdate({ status: 'Done' }, { status: 'Done' })
    })

    expect(result).toMatchObject({ ok: false, errorCode: 'dart.rateLimited' })
    expect(hook.result.current.task?.status).toBe('To-do')
    expect(hook.result.current.notice?.kind).toBe('refused')
    expect(host.count('dart.updateTask')).toBe(1)

    act(() => hook.result.current.dismissNotice())
    expect(hook.result.current.notice).toBeNull()
  })

  it('blocks a field after an unknown outcome until the user dismisses the notice', async () => {
    const { hook, host } = await openReady()
    host.lostReplies.push({
      ok: false,
      error: 'Failed to update Dart task.',
      errorCode: 'dart.updateFailed',
      outcome: 'unknown'
    })

    await act(async () => {
      await hook.result.current.onUpdate({ status: 'Done' }, { status: 'Done' })
    })

    expect(hook.result.current.notice?.kind).toBe('unknown')
    expect(hook.result.current.blockedFields.has('status')).toBe(true)
    await act(async () => {
      await hook.result.current.onUpdate({ status: 'To-do' }, { status: 'To-do' })
    })
    expect(host.count('dart.updateTask')).toBe(1)

    await act(async () => hook.result.current.recheckNotice())
    expect(hook.result.current.notice?.checkedAt).toEqual(expect.any(Number))

    act(() => hook.result.current.dismissNotice())
    expect(hook.result.current.blockedFields.size).toBe(0)
  })

  it('keeps the new value when a read that started before a write resolves after it', async () => {
    const { host, taskId, mount } = openDetail()
    const releaseRead = host.hold('dart.getTask')
    const hook = mount()
    await waitFor(() => expect(host.count('dart.getTask')).toBe(1))

    await act(async () => {
      await hook.result.current.onUpdate({ status: 'Done' }, { status: 'Done' })
    })
    const readsBeforeRelease = host.count('dart.getTask')
    expect(hook.result.current.task?.status).toBe('Done')

    await act(async () => {
      releaseRead()
    })

    await waitFor(() => expect(hook.result.current.full.status).toBe('ready'))
    expect(host.count('dart.getTask')).toBe(readsBeforeRelease + 1)
    expect(hook.result.current.task?.status).toBe('Done')
    expect(host.tasks.get(taskId)?.status).toBe('Done')
  })

  it('re-reads at most twice, then shows the last read with the edit over it', async () => {
    const { host, env, taskId, mount } = openDetail()
    let reads = 0
    const handle = host.handle.bind(host)
    host.handle = (method, params) => {
      if (method === 'dart.getTask') {
        reads += 1
        host.addTask({ ...host.tasks.get(taskId)!, title: `Read ${reads}` })
        bumpDartEpochs({ hostKey: `runtime:${env}`, accountKey: viewer.id, taskId })
      }
      return handle(method, params)
    }
    const releaseRead = host.hold('dart.getTask')
    const releaseWrite = host.hold('dart.updateTask')
    const hook = mount()
    await waitFor(() => expect(reads).toBe(1))
    let write: Promise<unknown> = Promise.resolve()
    act(() => {
      write = hook.result.current.onUpdate({ status: 'Done' }, { status: 'Done' })
    })

    await act(async () => {
      releaseRead()
    })

    await waitFor(() => expect(hook.result.current.full.status).toBe('ready'))
    expect(reads).toBe(3)
    expect(hook.result.current.task?.title).toBe('Read 3')
    expect(hook.result.current.task?.status).toBe('Done')

    await act(async () => {
      releaseWrite()
      await write
    })
  })

  it('does not show a slow latest read of the last task on the task opened since', async () => {
    const { host, taskId, row, context } = openDetail()
    const nextTaskId = `${taskId}Next`
    host.addTask(dartTaskFixture(nextTaskId, { description: 'Next task description' }))
    const hook = renderHook(
      ({ task }) =>
        useDartTaskDetailData(
          task,
          context,
          useAppStore((s) => getProviderRuntimeContextKey(s.settings))
        ),
      {
        initialProps: { task: row }
      }
    )
    await waitFor(() => expect(hook.result.current.full.status).toBe('ready'))
    host.addTask({ ...host.tasks.get(taskId)!, description: 'Changed in Dart' })
    const release = host.hold('dart.getTask')
    let slowRead: ReturnType<typeof hook.result.current.readLatestTask> | undefined
    act(() => {
      slowRead = hook.result.current.readLatestTask()
    })

    hook.rerender({ task: dartTaskFixture(nextTaskId) })
    await waitFor(() =>
      expect(hook.result.current.description).toEqual({
        status: 'ready',
        value: 'Next task description'
      })
    )
    await act(async () => {
      release()
      await slowRead
    })

    expect(hook.result.current.task?.id).toBe(nextTaskId)
    expect(hook.result.current.description).toEqual({
      status: 'ready',
      value: 'Next task description'
    })
  })

  it('shows Dart’s value for field B while field A keeps its pending edit', async () => {
    const { hook, host, taskId } = await openReady()
    const release = host.hold('dart.updateTask')
    let write: Promise<unknown> = Promise.resolve()
    act(() => {
      write = hook.result.current.onUpdate({ status: 'Done' }, { status: 'Done' })
    })
    await waitFor(() => expect(host.count('dart.updateTask')).toBe(1))
    host.addTask({ ...host.tasks.get(taskId)!, priority: 'High' })

    await act(async () => {
      hook.result.current.retry()
    })
    await waitFor(() => expect(hook.result.current.full.status).toBe('ready'))

    expect(hook.result.current.task?.priority).toBe('High')
    expect(hook.result.current.task?.status).toBe('Done')

    await act(async () => {
      release()
      await write
    })
  })

  it('does not lose a new comment to a comments read that started before the add', async () => {
    const { host, mount } = openDetail()
    const releaseComments = host.hold('dart.listComments')
    const hook = mount()
    await waitFor(() => expect(host.count('dart.listComments')).toBe(1))
    await waitFor(() => expect(hook.result.current.full.status).toBe('ready'))

    await act(async () => {
      await hook.result.current.onAddComment({ text: 'New comment' })
    })
    await act(async () => {
      releaseComments()
    })

    await waitFor(() => expect(hook.result.current.comments.status).toBe('ready'))
    const shown = hook.result.current.comments
    expect(shown.status === 'ready' && shown.value.comments.map((c) => c.text)).toEqual([
      'New comment'
    ])
    expect(host.count('dart.listComments')).toBe(2)
  })

  it('keeps an appended comment until Dart lists it, then shows it once', async () => {
    const { hook, comments, taskId } = await openReady()
    const added = { ...commentFixture('cAdded', 'Added'), taskId }

    act(() => hook.result.current.appendLocalComment(added))
    await act(async () => hook.result.current.reloadComments())

    const beforeListed = hook.result.current.comments
    expect(beforeListed.status === 'ready' && beforeListed.value.comments).toEqual([added])

    let fresh: DartComment[] = []
    await act(async () => {
      fresh = await hook.result.current.readLatestComments()
    })
    expect(fresh).toEqual([added])

    comments.push(commentFixture('cOlder', 'Older'), added)
    await act(async () => hook.result.current.reloadComments())

    const listed = hook.result.current.comments
    expect(listed.status === 'ready' && listed.value.comments.map((c) => c.id)).toEqual([
      'cOlder',
      'cAdded'
    ])
    expect(listed.status === 'ready' && listed.value.totalCount).toBe(2)
  })

  it.each(['refused', 'malformed'] as const)(
    'keeps previous and posted comments when a %s reload fails',
    async (failure) => {
      const page = openDetail()
      page.comments.push(commentFixture('older', 'Older'))
      const hook = page.mount()
      await waitFor(() => expect(hook.result.current.comments.status).toBe('ready'))
      await act(async () => {
        await hook.result.current.onAddComment({ text: 'Posted' })
      })
      const posted = page.comments.find((comment) => comment.text === 'Posted')!
      act(() => hook.result.current.appendLocalComment(posted))
      const handle = page.host.handle.bind(page.host)
      page.host.handle = async (method, params) => {
        if (method === 'dart.listComments') {
          return failure === 'refused'
            ? { ok: false, error: 'Unavailable', errorCode: 'dart.loadFailed' }
            : { ok: true, comments: [], totalCount: 1 }
        }
        return handle(method, params)
      }

      await act(async () => {
        await expect(hook.result.current.reloadComments()).rejects.toThrow()
      })
      const shown = hook.result.current.comments
      expect(
        shown.status === 'ready' && shown.value.comments.map((comment) => comment.text)
      ).toEqual(['Older', 'Posted'])
    }
  )

  it('shows an error when an initial latest comments read is overtaken by a write', async () => {
    const page = openDetail()
    const releaseInitial = page.host.hold('dart.listComments')
    const hook = page.mount()
    await waitFor(() => expect(page.host.count('dart.listComments')).toBe(1))
    const releaseRead = page.host.hold('dart.listComments')
    const pending = hook.result.current.readLatestComments()
    const rejected = expect(pending).rejects.toThrow()
    await waitFor(() => expect(page.host.count('dart.listComments')).toBe(2))

    await act(async () => {
      await hook.result.current.onAddComment({ text: 'Posted' })
      releaseInitial()
      releaseRead()
    })
    await rejected
    expect(hook.result.current.comments.status).toBe('error')
  })

  it('shows an error when an initial latest comments read is always stale', async () => {
    const page = openDetail()
    const releaseInitial = page.host.hold('dart.listComments')
    let reads = 0
    const handle = page.host.handle.bind(page.host)
    page.host.handle = async (method, params) => {
      const result = await handle(method, params)
      if (method === 'dart.listComments') {
        reads += 1
        bumpDartEpochs({
          hostKey: `runtime:${page.env}`,
          accountKey: viewer.id,
          taskId: page.taskId
        })
      }
      return result
    }
    const hook = page.mount()
    await waitFor(() => expect(page.host.count('dart.listComments')).toBe(1))
    const releaseRead = page.host.hold('dart.listComments')
    const pending = hook.result.current.readLatestComments()
    const rejected = expect(pending).rejects.toThrow()
    await waitFor(() => expect(page.host.count('dart.listComments')).toBe(2))

    await act(async () => {
      releaseInitial()
      releaseRead()
    })
    await rejected
    expect(reads).toBeGreaterThan(2)
    expect(hook.result.current.comments.status).toBe('error')
  })

  it('rejects a comments read whose epoch becomes stale before publishing', async () => {
    const page = await openReady()
    const shown = { ...commentFixture('shown', 'Already shown'), taskId: page.taskId }
    act(() => page.hook.result.current.appendLocalComment(shown))
    const release = page.host.hold('dart.listComments')
    const pending = page.hook.result.current.readLatestComments()
    const rejected = expect(pending).rejects.toThrow()
    await waitFor(() => expect(page.host.count('dart.listComments')).toBeGreaterThan(1))
    bumpDartEpochs({
      hostKey: `runtime:${page.env}`,
      accountKey: viewer.id,
      taskId: page.taskId
    })
    await act(async () => release())
    await rejected
    expect(page.hook.result.current.comments).toMatchObject({
      status: 'ready',
      value: { comments: [shown] }
    })
  })

  it('keeps displayed comments when a raw row cannot be mapped', async () => {
    const page = await openReady()
    const shown = { ...commentFixture('shown', 'Already shown'), taskId: page.taskId }
    act(() => page.hook.result.current.appendLocalComment(shown))
    const handle = page.host.handle.bind(page.host)
    page.host.handle = async (method, params) => {
      if (method === 'dart.listComments') {
        page.host.requests.push({ method, params })
        return { ok: true, comments: [shown], totalCount: 2, rawCount: 2 }
      }
      return handle(method, params)
    }
    await expect(page.hook.result.current.readLatestComments()).rejects.toThrow()
    expect(page.hook.result.current.comments).toMatchObject({
      status: 'ready',
      value: { comments: [shown] }
    })
  })
  it('does not replace a newer comments reload with a superseded failure', async () => {
    const { hook, host, comments } = await openReady()
    const pending = Promise.withResolvers<object>()
    const handle = host.handle.bind(host)
    let first = true
    host.handle = async (method, params) => {
      if (method === 'dart.listComments' && first) {
        first = false
        return pending.promise
      }
      return handle(method, params)
    }
    let older: Promise<void> = Promise.resolve()
    act(() => {
      older = hook.result.current.reloadComments()
      void older.catch(() => {})
    })
    comments.push(commentFixture('newer', 'Newer'))
    await act(async () => hook.result.current.reloadComments())
    await act(async () => {
      pending.resolve({ ok: false, error: 'Unavailable', errorCode: 'dart.loadFailed' })
      await expect(older).rejects.toThrow()
    })
    const shown = hook.result.current.comments
    expect(shown.status === 'ready' && shown.value.comments.map((comment) => comment.text)).toEqual(
      ['Newer']
    )
  })
  it.each([
    ['refused', { ok: false, error: 'Unavailable', errorCode: 'dart.loadFailed' }],
    ['malformed', { ok: true, comments: [], totalCount: 0, rawCount: 1 }]
  ] as const)('shows an error when an initial latest comments read is %s', async (_, reply) => {
    const page = openDetail()
    const releaseInitial = page.host.hold('dart.listComments')
    const hook = page.mount()
    await waitFor(() => expect(page.host.count('dart.listComments')).toBe(1))
    const handle = page.host.handle.bind(page.host)
    page.host.handle = async (method, params) => {
      if (method === 'dart.listComments') {
        page.host.requests.push({ method, params })
        return reply
      }
      return handle(method, params)
    }

    await act(async () => {
      await expect(hook.result.current.readLatestComments()).rejects.toThrow()
    })
    expect(hook.result.current.comments.status).toBe('error')
    await act(async () => releaseInitial())
  })

  it('keeps shown comments when Retry comments read throws', async () => {
    const page = await openReady()
    const shown = { ...commentFixture('shown', 'Already shown'), taskId: page.taskId }
    act(() => page.hook.result.current.appendLocalComment(shown))
    const handle = page.host.handle.bind(page.host)
    page.host.handle = async (method, params) => {
      if (method === 'dart.listComments') {
        page.host.requests.push({ method, params })
        throw new Error('Read failed')
      }
      return handle(method, params)
    }

    act(() => page.hook.result.current.retry())
    await waitFor(() => expect(page.hook.result.current.comments.status).toBe('ready'))
    expect(page.hook.result.current.comments).toMatchObject({
      status: 'ready',
      value: { comments: [shown] }
    })
  })

  it('keeps shown comments when Retry comments read is refused', async () => {
    const page = await openReady()
    const shown = { ...commentFixture('shown', 'Already shown'), taskId: page.taskId }
    act(() => page.hook.result.current.appendLocalComment(shown))
    const handle = page.host.handle.bind(page.host)
    page.host.handle = async (method, params) => {
      if (method === 'dart.listComments') {
        page.host.requests.push({ method, params })
        return { ok: false, error: 'Unavailable', errorCode: 'dart.loadFailed' }
      }
      return handle(method, params)
    }

    act(() => page.hook.result.current.retry())
    await waitFor(() => expect(page.hook.result.current.comments.status).toBe('ready'))
    expect(page.hook.result.current.comments).toMatchObject({
      status: 'ready',
      value: { comments: [shown] }
    })
  })

  it('shows the patched description from a targeted save and sends no description field', async () => {
    const { hook, host } = await openReady()

    await act(async () => {
      await hook.result.current.onSavePatch([
        { type: 'replace', oldText: 'Original', newText: 'New' }
      ])
    })

    expect(hook.result.current.description).toEqual({
      status: 'ready',
      value: 'patched description'
    })
    expect(host.count('dart.updateTaskDescription')).toBe(1)
    expect(host.count('dart.updateTask')).toBe(0)
  })

  it('reads the latest task forced, past every cache', async () => {
    const { hook, host, taskId } = await openReady()
    host.addTask({ ...host.tasks.get(taskId)!, description: 'Changed in Dart' })

    let latest: Awaited<ReturnType<typeof hook.result.current.readLatestTask>> | undefined
    await act(async () => {
      latest = await hook.result.current.readLatestTask()
    })

    expect(latest).toMatchObject({ ok: true, task: { description: 'Changed in Dart' } })
    expect(hook.result.current.description).toEqual({
      status: 'ready',
      value: 'Changed in Dart'
    })
  })

  it('runs close guards until one refuses', async () => {
    const { hook } = await openReady()
    const unregister = hook.result.current.registerCloseGuard(() => false)

    await expect(hook.result.current.runCloseGuards()).resolves.toBe(false)

    unregister()
    await expect(hook.result.current.runCloseGuards()).resolves.toBe(true)
  })

  it('keys draft boxes by host and account, not by session', async () => {
    const { hook, taskId, env } = await openReady()

    expect(hook.result.current.commentDraftKey).toContain(`runtime:${env}`)
    expect(hook.result.current.commentDraftKey).toContain(viewer.id)
    expect(hook.result.current.descriptionDraftKey).toContain(taskId)
    expect(hook.result.current.commentDraftKey).not.toBe(hook.result.current.descriptionDraftKey)
  })
})
