// @vitest-environment happy-dom

import { useEffect } from 'react'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import {
  dartTaskFixture,
  installFakeDartRuntime,
  type FakeDartHost
} from '@/store/slices/dart/dart-fake-runtime.test-support'
import { getDartReadScope } from '@/store/slices/dart/dart-read-coordination'
import type { DartDetailDescriptionApi, DartDetailEditApi } from './dart-detail-contracts'
import { TaskPageDartTaskDetail } from './TaskDetail'

// The editors arrive in later tasks; these probes stand in for them to drive the wiring they will use.
const probe = vi.hoisted(() => ({ guard: (): boolean => true }))

vi.mock('./TaskDetailDescription', () => ({
  DartTaskDetailDescription: ({ registerCloseGuard }: DartDetailDescriptionApi) => {
    useEffect(() => registerCloseGuard(() => probe.guard()), [registerCloseGuard])
    return null
  }
}))

vi.mock('./TaskDetailProperties', () => ({
  DartTaskDetailProperties: ({ onUpdate }: DartDetailEditApi) => (
    <>
      <button type="button" onClick={() => void onUpdate({ status: 'Done' }, { status: 'Done' })}>
        set status
      </button>
      <button
        type="button"
        onClick={() => void onUpdate({ priority: 'High' }, { priority: 'High' })}
      >
        set priority
      </button>
    </>
  )
}))

const viewer = { id: 'user-a', name: 'Alex Example' }
const realWindow = window
let runtime: ReturnType<typeof installFakeDartRuntime>
let nextHost = 0

function sourceContext(env: string): TaskSourceContext {
  return {
    kind: 'task-source',
    provider: 'dart',
    projectId: 'project-1',
    hostId: `runtime:${env}`,
    providerIdentity: { provider: 'dart', userId: viewer.id }
  }
}

/** The shared fake answers neither comments nor config. */
function answerCommentsAndConfig(host: FakeDartHost, boardName: string): void {
  const handle = host.handle.bind(host)
  host.handle = async (method, params) => {
    if (method === 'dart.config') {
      host.requests.push({ method, params })
      return {
        ok: true,
        config: {
          dartboards: [boardName],
          statuses: ['To-do', 'Done'],
          types: [],
          tags: [],
          priorities: [],
          sizes: [],
          assignees: []
        }
      }
    }
    if (method === 'dart.listComments') {
      host.requests.push({ method, params })
      return { ok: true, comments: [], totalCount: 0 }
    }
    return handle(method, params)
  }
}

function openDetail(options: { detailEnv?: string; onClose?: () => void } = {}) {
  nextHost += 1
  const pageEnv = `page-host-${nextHost}`
  const detailEnv = options.detailEnv ?? pageEnv
  const taskId = `taskSheet${String(nextHost).padStart(3, '0')}`
  const host = runtime.host(detailEnv)
  answerCommentsAndConfig(host, `Board of ${detailEnv}`)
  const task = dartTaskFixture(taskId, { description: 'Original description' })
  host.addTask(task)
  const settings = { ...useAppStore.getState().settings!, activeRuntimeEnvironmentId: pageEnv }
  useAppStore.setState({
    settings,
    dartStatus: { connected: true, viewer },
    dartStatusChecked: true,
    dartStatusContextKey: getDartReadScope(settings).contextKey
  })
  const onClose = options.onClose ?? vi.fn()
  render(
    <TooltipProvider>
      <TaskPageDartTaskDetail
        task={task}
        sourceContext={sourceContext(detailEnv)}
        workspaces={[]}
        onUse={vi.fn()}
        onClose={onClose}
        onOpenWorkspace={vi.fn()}
      />
    </TooltipProvider>
  )
  return { pageEnv, detailEnv, host, onClose }
}

beforeEach(() => {
  probe.guard = () => true
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

describe('TaskPageDartTaskDetail close guard', () => {
  it('stays open while a guard refuses and closes once it allows', async () => {
    const user = userEvent.setup()
    const { onClose } = openDetail()
    const close = await screen.findByRole('button', { name: 'Close Dart task preview' })

    probe.guard = () => false
    await user.click(close)
    await user.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()

    probe.guard = () => true
    await user.click(close)
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(2))
  })
})

describe('TaskPageDartTaskDetail write notice', () => {
  it('shows a refused write as an alert that stays through other edits until dismissed', async () => {
    const user = userEvent.setup()
    const { host } = openDetail()
    host.refusals.push({
      ok: false,
      error: 'Slow down',
      errorCode: 'dart.rateLimited',
      outcome: 'notApplied'
    })

    await user.click(await screen.findByRole('button', { name: 'set status' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('rate limiting')

    await user.click(screen.getByRole('button', { name: 'set priority' }))
    await waitFor(() => expect(host.count('dart.updateTask')).toBe(2))
    expect(screen.getByRole('alert').textContent).toContain('rate limiting')

    await user.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows an unknown outcome as a status with Check again and the read time until dismissed', async () => {
    const user = userEvent.setup()
    const { host } = openDetail()
    host.lostReplies.push({
      ok: false,
      error: 'Failed to update Dart task.',
      errorCode: 'dart.updateFailed',
      outcome: 'unknown'
    })

    await user.click(await screen.findByRole('button', { name: 'set status' }))
    const status = await screen.findByRole('status')
    expect(status.textContent).toContain('Dart may have applied this change')
    expect(screen.queryByRole('alert')).toBeNull()

    await user.click(within(status).getByRole('button', { name: 'Check again' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Last checked'))

    await user.click(screen.getByRole('button', { name: 'set priority' }))
    await waitFor(() => expect(host.count('dart.updateTask')).toBe(2))
    expect(screen.getByRole('status').textContent).toContain('Dart may have applied')

    await user.click(within(screen.getByRole('status')).getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('TaskPageDartTaskDetail scope', () => {
  it('reads the task, comments and config in its own scope, not the page’s', async () => {
    const { host, pageEnv } = openDetail({ detailEnv: `detail-only-${nextHost + 1}` })

    await waitFor(() => expect(host.count('dart.config')).toBeGreaterThan(0))
    await waitFor(() => expect(host.count('dart.listComments')).toBeGreaterThan(0))
    expect(host.count('dart.getTask')).toBeGreaterThan(0)
    for (const method of ['dart.getTask', 'dart.listComments', 'dart.config']) {
      expect(runtime.host(pageEnv).count(method)).toBe(0)
    }

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'set status' }))
    await waitFor(() => expect(host.count('dart.updateTask')).toBe(1))
    expect(runtime.host(pageEnv).count('dart.updateTask')).toBe(0)
  })
})
