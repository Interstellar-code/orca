// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DartComment } from '../../../../../shared/dart/dart-types'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
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

function isCommentReply(reply: object): reply is { comment: DartComment } {
  return 'comment' in reply
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
  const mount = () => renderHook(() => useDartTaskDetailData(row, context))
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
    const { hook, host, taskId, env } = await openReady({ detailEnv: pageOnly })

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
    expect(hook.result.current.viewerName).toBeNull()
  })

  it('names the viewer only for the page’s own environment and account', async () => {
    const same = await openReady()
    expect(same.hook.result.current.viewerName).toBe(viewer.name)
    cleanup()

    const otherAccount = await openReady({ userId: 'user-b' })
    expect(otherAccount.hook.result.current.viewerName).toBeNull()
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

  it('re-reads at most twice when writes keep overtaking the read', async () => {
    const { host, env, taskId, mount } = openDetail()
    const handle = host.handle.bind(host)
    host.handle = (method, params) => {
      if (method === 'dart.getTask') {
        bumpDartEpochs({ hostKey: `runtime:${env}`, accountKey: viewer.id, taskId })
      }
      return handle(method, params)
    }

    const hook = mount()

    await waitFor(() => expect(hook.result.current.full.status).toBe('ready'))
    expect(host.count('dart.getTask')).toBe(3)
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
    const { hook, comments } = await openReady()
    const added = commentFixture('cAdded', 'Added')

    act(() => hook.result.current.appendLocalComment(added))
    await act(async () => hook.result.current.reloadComments())

    const beforeListed = hook.result.current.comments
    expect(beforeListed.status === 'ready' && beforeListed.value.comments).toEqual([added])

    comments.push(commentFixture('cOlder', 'Older'), added)
    await act(async () => hook.result.current.reloadComments())

    const listed = hook.result.current.comments
    expect(listed.status === 'ready' && listed.value.comments.map((c) => c.id)).toEqual([
      'cOlder',
      'cAdded'
    ])
    expect(listed.status === 'ready' && listed.value.totalCount).toBe(2)
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
