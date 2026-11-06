// @vitest-environment happy-dom

import { useEffect } from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Button } from '@/components/ui/button'
import type { DartDetailDescriptionApi, DartDetailEditApi } from './dart-detail-contracts'
import { DartTaskDetailNotice } from './TaskDetailNotice'
import {
  openRenderedDartDetail,
  setUpRenderedDartDetail,
  tearDownRenderedDartDetail
} from './dart-task-detail.test-support'

// The editors arrive in later tasks; these probes stand in for them to drive the wiring they will use.
const probe = vi.hoisted(() => ({
  guard: (): boolean | Promise<boolean> => true
}))

vi.mock('./TaskDetailDescription', () => ({
  DartTaskDetailDescription: ({ registerCloseGuard, onSavePatch }: DartDetailDescriptionApi) => {
    useEffect(() => registerCloseGuard(() => probe.guard()), [registerCloseGuard])
    return (
      <button
        type="button"
        onClick={() => void onSavePatch([{ type: 'replace', oldText: 'Original', newText: 'New' }])}
      >
        save patch
      </button>
    )
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

let runtime: ReturnType<typeof setUpRenderedDartDetail>
const openDetail = openRenderedDartDetail

beforeEach(() => {
  probe.guard = () => true
  runtime = setUpRenderedDartDetail()
})

afterEach(tearDownRenderedDartDetail)

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

describe('TaskPageDartTaskDetail pending close guard', () => {
  it('runs one guard pass for a double close', async () => {
    const user = userEvent.setup()
    const { onClose } = openDetail()
    let settle: (allowed: boolean) => void = () => {}
    let runs = 0
    probe.guard = () => {
      runs += 1
      return new Promise<boolean>((resolve) => (settle = resolve))
    }
    const close = await screen.findByRole('button', { name: 'Close Dart task preview' })

    await user.click(close)
    await user.click(close)
    expect(runs).toBe(1)

    settle(true)
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('drops an allowed close when the task changed while the guard was pending', async () => {
    const user = userEvent.setup()
    const { onClose, addTask, showTask } = openDetail()
    let settle: (allowed: boolean) => void = () => {}
    probe.guard = () => new Promise<boolean>((resolve) => (settle = resolve))
    await user.click(await screen.findByRole('button', { name: 'Close Dart task preview' }))

    showTask(addTask('b'))
    settle(true)
    await act(async () => {})
    expect(onClose).not.toHaveBeenCalled()
  })

  it('stays open when a guard rejects', async () => {
    const user = userEvent.setup()
    const { onClose } = openDetail()
    probe.guard = () => Promise.reject(new Error('guard failed'))

    await user.click(await screen.findByRole('button', { name: 'Close Dart task preview' }))
    await act(async () => {})
    expect(onClose).not.toHaveBeenCalled()

    probe.guard = () => true
    await user.click(screen.getByRole('button', { name: 'Close Dart task preview' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
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
    expect(alert.textContent).toContain("Status wasn't saved:")
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
    expect(status.textContent).toContain('Status: Dart may have applied this change')
    expect(screen.queryByRole('alert')).toBeNull()

    const releaseRead = host.hold('dart.getTask')
    await user.click(within(status).getByRole('button', { name: 'Check again' }))
    const checking = await screen.findByRole('button', { name: 'Checking…' })
    expect(checking.hasAttribute('disabled')).toBe(true)
    releaseRead()
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Last checked'))

    await user.click(screen.getByRole('button', { name: 'set priority' }))
    await waitFor(() => expect(host.count('dart.updateTask')).toBe(2))
    expect(screen.getByRole('status').textContent).toContain('Dart may have applied')

    await user.click(within(screen.getByRole('status')).getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('DartTaskDetailNotice actions', () => {
  it('renders a section action before Dismiss and keeps it clickable', async () => {
    const user = userEvent.setup()
    const onCopy = vi.fn()
    render(
      <DartTaskDetailNotice
        notice={{
          kind: 'refused',
          field: 'description',
          message: 'Dart did not accept this change.'
        }}
        dismissNotice={vi.fn()}
        recheckNotice={() => Promise.resolve()}
        actions={
          <Button type="button" variant="outline" size="xs" onClick={onCopy}>
            Copy my text
          </Button>
        }
      />
    )

    const buttons = within(screen.getByRole('alert')).getAllByRole('button')
    expect(buttons.map((button) => button.textContent)).toEqual(['Copy my text', 'Dismiss'])
    await user.click(buttons[0])
    expect(onCopy).toHaveBeenCalledTimes(1)
  })
})

describe('TaskPageDartTaskDetail description notice', () => {
  it('leaves a description notice to the description section', async () => {
    const user = userEvent.setup()
    const { host } = openDetail()
    host.refusals.push({
      ok: false,
      error: 'Dart did not accept this change.',
      errorCode: 'dart.descriptionPatchRefused',
      outcome: 'notApplied'
    })

    await user.click(await screen.findByRole('button', { name: 'save patch' }))
    await waitFor(() => expect(host.count('dart.updateTaskDescription')).toBe(1))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('TaskPageDartTaskDetail scope', () => {
  it('reads the task, comments and config in its own scope, not the page’s', async () => {
    const { host, pageEnv } = openDetail({ detailEnv: `detail-only-${Date.now()}` })

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
