// @vitest-environment happy-dom

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DartTask, DartWorkspaceConfig } from '../../../../../shared/dart/dart-types'
import { DART_WRITES_V2_RUNTIME_CAPABILITY } from '../../../../../shared/dart/dart-capabilities'
import { dartSupportsWritesV2ForTarget } from '@/runtime/runtime-dart-write-client'
import { createCompatibleRuntimeStatusResponse } from '@/runtime/runtime-compatibility-test-fixture'
import type { FakeDartHost } from '@/store/slices/dart/dart-fake-runtime.test-support'
import {
  dartDetailViewer,
  openRenderedDartDetail,
  setUpRenderedDartDetail,
  tearDownRenderedDartDetail
} from './dart-task-detail.test-support'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const CONFIG: DartWorkspaceConfig = {
  dartboards: ['Board A', 'Board B'],
  statuses: ['To-do', 'Done'],
  types: [],
  tags: ['search', 'backend', 'billing'],
  priorities: ['high', 'medium', 'low'],
  sizes: ['1', '3', '5'],
  assignees: [dartDetailViewer.name, 'Sam Example']
}

let runtime: ReturnType<typeof setUpRenderedDartDetail>

beforeEach(() => {
  runtime = setUpRenderedDartDetail()
  vi.mocked(toast.error).mockClear()
})

afterEach(tearDownRenderedDartDetail)

function lastUpdate(host: FakeDartHost): { taskId?: string; updates?: Record<string, unknown> } {
  return host.requests.findLast((request) => request.method === 'dart.updateTask')!.params
}

function textarea(element: HTMLElement): HTMLTextAreaElement {
  if (!(element instanceof HTMLTextAreaElement)) {
    throw new Error('Expected a textarea')
  }
  return element
}

function taskOf(host: FakeDartHost, id: string): DartTask {
  return host.tasks.get(id)!
}

function openDetail(options: Parameters<typeof openRenderedDartDetail>[0] = {}) {
  return openRenderedDartDetail({ config: CONFIG, ...options })
}

/** A host that lacks `dart.writes.v2`, as an older server answers the capability probe. */
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

async function chooseOption(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  option: string
) {
  await user.click(await screen.findByRole('combobox', { name: label }))
  await user.click(await screen.findByRole('option', { name: option }))
}

describe('detail property editors', () => {
  it('shows a chosen status before the reply and sends the canonical value once', async () => {
    const user = userEvent.setup()
    const { host, task } = openDetail()
    const release = host.hold('dart.updateTask')

    await chooseOption(user, 'Status', 'Done')

    expect((await screen.findByRole('combobox', { name: 'Status' })).textContent).toContain('Done')
    expect(host.count('dart.updateTask')).toBe(1)
    expect(lastUpdate(host)).toMatchObject({ taskId: task.id, updates: { status: 'Done' } })
    await act(async () => release())
    await waitFor(() => expect(taskOf(host, task.id).status).toBe('Done'))
  })

  it('restores the old value and names the field when Dart refuses', async () => {
    const user = userEvent.setup()
    const { host } = openDetail()
    host.refusals.push({
      ok: false,
      error: 'Dart refused.',
      errorCode: 'dart.badRequest',
      outcome: 'notApplied'
    })

    await chooseOption(user, 'Status', 'Done')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain("Status wasn't saved:")
    expect(screen.getByRole('combobox', { name: 'Status' }).textContent).toContain('To-do')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('offers the options of the detail’s config', async () => {
    const user = userEvent.setup()
    openDetail({ config: { ...CONFIG, statuses: ['Alpha', 'Beta'] } })

    await user.click(await screen.findByRole('combobox', { name: 'Status' }))
    const options = await screen.findAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual(['To-do', 'Alpha', 'Beta'])
  })

  it('matches the capitalized task priority from Dart (Medium) to the lowercase config option and writes the config spelling', async () => {
    const user = userEvent.setup()
    const { host } = openDetail()
    const chip = await screen.findByRole('combobox', { name: 'Priority' })
    expect(chip.textContent).toBe('medium')
    await user.click(chip)
    const options = await screen.findAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual(['None', 'high', 'medium', 'low'])
    await user.click(screen.getByRole('option', { name: 'low' }))
    await waitFor(() => expect(lastUpdate(host).updates).toEqual({ priority: 'low' }))
  })

  it('sends null for priority None and for Unassigned', async () => {
    const user = userEvent.setup()
    const { host } = openDetail()

    await chooseOption(user, 'Priority', 'None')
    await waitFor(() => expect(lastUpdate(host).updates).toEqual({ priority: null }))

    await user.click(await screen.findByRole('combobox', { name: 'Assignee' }))
    await user.click(await screen.findByRole('option', { name: 'Sam Example' }))
    await waitFor(() => expect(lastUpdate(host).updates).toEqual({ assignee: 'Sam Example' }))
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Assignee' }).hasAttribute('aria-disabled')).toBe(
        false
      )
    )

    await user.click(screen.getByRole('combobox', { name: 'Assignee' }))
    await user.click(await screen.findByRole('option', { name: 'Unassigned' }))
    await waitFor(() => expect(lastUpdate(host).updates).toEqual({ assignee: null }))
  })

  it('assigns to the viewer', async () => {
    const user = userEvent.setup()
    const { host } = openDetail()

    await user.click(await screen.findByRole('combobox', { name: 'Assignee' }))
    await user.click(await screen.findByRole('option', { name: 'Assign to me' }))
    await waitFor(() =>
      expect(lastUpdate(host).updates).toEqual({ assignee: dartDetailViewer.name })
    )
  })

  it('omits Assign to me when the detail has no viewer name', async () => {
    const user = userEvent.setup()
    const detailEnv = `other-host-${Date.now()}`
    runtime.host(detailEnv).connection = { connected: true, viewer: null }
    openDetail({ detailEnv })

    await user.click(await screen.findByRole('combobox', { name: 'Assignee' }))
    await screen.findByRole('option', { name: 'Unassigned' })
    expect(screen.queryByRole('option', { name: 'Assign to me' })).toBeNull()
  })

  it('omits Assign to me when the viewer is not a listed assignee', async () => {
    const user = userEvent.setup()
    openDetail({ config: { ...CONFIG, assignees: ['Sam Example'] } })

    await user.click(await screen.findByRole('combobox', { name: 'Assignee' }))
    await screen.findByRole('option', { name: 'Unassigned' })
    expect(screen.queryByRole('option', { name: 'Assign to me' })).toBeNull()
  })

  it('sends the whole tag set on every change', async () => {
    const user = userEvent.setup()
    const { host } = openDetail()

    await user.click(await screen.findByRole('button', { name: 'Tags' }))
    await user.click(await screen.findByRole('option', { name: 'search' }))
    await waitFor(() => expect(lastUpdate(host).updates).toEqual({ tags: ['search'] }))

    await user.click(await screen.findByRole('option', { name: 'backend' }))
    await waitFor(() => expect(lastUpdate(host).updates).toEqual({ tags: ['search', 'backend'] }))
  })

  it('sends a typed date once, on blur, and clears it with null', async () => {
    const user = userEvent.setup()
    const { host } = openDetail()
    const due = await screen.findByLabelText('Due')

    // Each step is what a native date input reports while the user types or presses ArrowUp.
    for (const step of ['2026-11-20', '2026-11-21', '2026-11-22', '2026-12-22', '2026-12-24']) {
      fireEvent.change(due, { target: { value: step } })
    }
    expect(host.count('dart.updateTask')).toBe(0)
    fireEvent.blur(due)
    await waitFor(() => expect(lastUpdate(host).updates).toEqual({ dueAt: '2026-12-24' }))
    expect(host.count('dart.updateTask')).toBe(1)

    await user.click(await screen.findByRole('button', { name: 'Clear Due' }))
    await waitFor(() => expect(lastUpdate(host).updates).toEqual({ dueAt: null }))
  })

  it('saves a date on Enter and drops the draft on Escape', async () => {
    const user = userEvent.setup()
    const { host } = openDetail()
    const start = await screen.findByLabelText('Start')

    await user.click(start)
    fireEvent.change(start, { target: { value: '2026-12-01' } })
    await user.keyboard('{Escape}')
    expect(host.count('dart.updateTask')).toBe(0)

    await user.click(start)
    fireEvent.change(start, { target: { value: '2026-12-02' } })
    await user.keyboard('{Enter}')
    await waitFor(() => expect(lastUpdate(host).updates).toEqual({ startAt: '2026-12-02' }))
    expect(host.count('dart.updateTask')).toBe(1)
  })

  it('does not send a half-typed year', async () => {
    const { host } = openDetail()
    const start = await screen.findByLabelText('Start')
    fireEvent.change(start, { target: { value: '0002-11-04' } })
    fireEvent.blur(start)
    await act(async () => {})
    expect(host.count('dart.updateTask')).toBe(0)
  })

  it('shows size and dates as text on a host without writes v2', async () => {
    const detailEnv = `old-host-${Date.now()}`
    withoutWritesV2(detailEnv)
    const early = runtime.host(detailEnv)
    const handle = early.handle.bind(early)
    early.handle = async (method, params) => {
      const reply = await handle(method, params)
      return method === 'dart.getTask' && 'task' in reply && typeof reply.task === 'object'
        ? { ...reply, task: { ...reply.task, size: '3', dueAt: '2026-11-20T00:00:00.000Z' } }
        : reply
    }
    const { host } = openDetail({ detailEnv })
    await waitFor(() => expect(host.count('dart.config')).toBeGreaterThan(0))
    await screen.findByRole('combobox', { name: 'Status' })
    await act(async () => {
      await dartSupportsWritesV2ForTarget({ kind: 'environment', environmentId: detailEnv })
    })

    await screen.findByText('11/20/2026')
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.queryByLabelText('Due')).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Size' })).toBeNull()
    expect(screen.queryByLabelText('Start')).toBeNull()
  })

  it('shows the status the server returned after a dartboard move', async () => {
    const user = userEvent.setup()
    const { host, task } = openDetail()
    const handle = host.handle.bind(host)
    host.handle = async (method, params) => {
      const reply = await handle(method, params)
      if (method === 'dart.updateTask' && 'task' in reply) {
        const moved = { ...taskOf(host, task.id), status: 'Done' }
        host.tasks.set(task.id, moved)
        return { ok: true, task: moved }
      }
      return reply
    }

    await user.click(await screen.findByRole('combobox', { name: 'Dartboard' }))
    await user.click(await screen.findByRole('option', { name: 'Board B' }))

    await waitFor(() => expect(lastUpdate(host).updates).toEqual({ dartboard: 'Board B' }))
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Status' }).textContent).toContain('Done')
    )
  })
})

describe('detail title editor', () => {
  it('saves on Enter, trimmed, and reverts on Escape', async () => {
    const user = userEvent.setup()
    const { host } = openDetail()
    const title = await screen.findByRole('textbox', { name: 'Title' })

    await user.clear(title)
    await user.type(title, 'Discarded{Escape}')
    expect(textarea(title).value).toBe('Example task')
    expect(host.count('dart.updateTask')).toBe(0)

    await user.clear(title)
    await user.type(title, '  New title  {Enter}')
    await waitFor(() => expect(lastUpdate(host).updates).toEqual({ title: 'New title' }))
  })

  it('refuses an empty or too long title with a toast and keeps the saved one', async () => {
    const user = userEvent.setup()
    const { host } = openDetail()
    const title = textarea(await screen.findByRole('textbox', { name: 'Title' }))

    await user.clear(title)
    await user.keyboard('{Enter}')
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(title.value).toBe('Example task')

    fireEvent.change(title, { target: { value: 'x'.repeat(501) } })
    fireEvent.blur(title)
    expect(toast.error).toHaveBeenCalledTimes(2)
    expect(title.value).toBe('x'.repeat(501))
    expect(host.count('dart.updateTask')).toBe(0)
  })

  it('does not save on the Enter that confirms an IME candidate', async () => {
    const { host } = openDetail()
    const title = textarea(await screen.findByRole('textbox', { name: 'Title' }))

    fireEvent.compositionStart(title)
    fireEvent.change(title, { target: { value: 'にほん' } })
    fireEvent.keyDown(title, { key: 'Enter', keyCode: 229, isComposing: true })
    expect(host.count('dart.updateTask')).toBe(0)
    expect(title.value).toBe('にほん')

    fireEvent.compositionEnd(title, { data: 'にほん' })
    fireEvent.blur(title)
    await waitFor(() => expect(lastUpdate(host).updates).toEqual({ title: 'にほん' }))
  })
})

describe('detail editor states', () => {
  it('keeps the pending slot laid out and shows the spinner while a save is held', async () => {
    const user = userEvent.setup()
    const { host } = openDetail()
    const status = await screen.findByRole('combobox', { name: 'Status' })
    const row = status.parentElement!
    const slotsBefore = row.querySelectorAll('span.size-3').length
    expect(slotsBefore).toBe(1)
    expect(row.querySelector('.animate-spin')).toBeNull()
    const release = host.hold('dart.updateTask')

    await chooseOption(user, 'Status', 'Done')

    await waitFor(() => expect(row.querySelector('.animate-spin')).not.toBeNull())
    expect(row.querySelectorAll('span.size-3').length).toBe(slotsBefore)
    expect(status.getAttribute('aria-disabled')).toBe('true')
    await act(async () => release())
    await waitFor(() => expect(row.querySelector('.animate-spin')).toBeNull())
    expect(status.hasAttribute('aria-disabled')).toBe(false)
  })

  it('shows the spinner without moving the control for dates, assignee and title too', async () => {
    const user = userEvent.setup()
    const { host } = openDetail()
    const due = await screen.findByLabelText('Due')
    const assignee = await screen.findByRole('combobox', { name: 'Assignee' })
    const title = await screen.findByRole('textbox', { name: 'Title' })
    const rows = [due, assignee, title].map((control) => control.parentElement!)
    const children = rows.map((row) => row.children.length)
    const release = host.hold('dart.updateTask')

    fireEvent.change(due, { target: { value: '2026-12-24' } })
    fireEvent.blur(due)
    await waitFor(() => expect(rows[0].querySelector('.animate-spin')).not.toBeNull())
    release()
    await waitFor(() => expect(rows[0].querySelector('.animate-spin')).toBeNull())

    const releaseAssignee = host.hold('dart.updateTask')
    await user.click(assignee)
    await user.click(await screen.findByRole('option', { name: 'Sam Example' }))
    await waitFor(() => expect(rows[1].querySelector('.animate-spin')).not.toBeNull())
    releaseAssignee()
    await waitFor(() => expect(rows[1].querySelector('.animate-spin')).toBeNull())

    const releaseTitle = host.hold('dart.updateTask')
    await user.clear(title)
    await user.type(title, 'Renamed{Enter}')
    await waitFor(() => expect(title.parentElement!.querySelector('.animate-spin')).not.toBeNull())
    releaseTitle()
    await waitFor(() => expect(title.parentElement!.querySelector('.animate-spin')).toBeNull())
    expect(rows.map((row) => row.children.length)).toEqual(children)
  })

  it('says why every picker is off when Dart returns no field options', async () => {
    openDetail({ config: null })

    expect(
      await screen.findByText(/Field options are not available from Dart right now/)
    ).toBeTruthy()
    for (const name of ['Status', 'Priority', 'Assignee', 'Dartboard']) {
      const control = await screen.findByRole('combobox', { name })
      expect(control.hasAttribute('disabled')).toBe(true)
    }
  })

  it('gives a blocked field its hint as text a screen reader can reach', async () => {
    const user = userEvent.setup()
    const { host } = openDetail()
    host.lostReplies.push({
      ok: false,
      error: 'Failed to update Dart task.',
      errorCode: 'dart.updateFailed',
      outcome: 'unknown'
    })

    await chooseOption(user, 'Status', 'Done')

    const status = await screen.findByRole('combobox', { name: 'Status' })
    await waitFor(() => expect(status.getAttribute('aria-describedby')).not.toBeNull())
    const hint = document.getElementById(status.getAttribute('aria-describedby')!)
    expect(hint?.textContent).toContain('Check the notice above first')
    expect(
      screen.getByRole('combobox', { name: 'Priority' }).getAttribute('aria-describedby')
    ).toBeNull()
  })

  it('disables a field after an unknown outcome and points at the notice', async () => {
    const user = userEvent.setup()
    const { host } = openDetail()
    host.lostReplies.push({
      ok: false,
      error: 'Failed to update Dart task.',
      errorCode: 'dart.updateFailed',
      outcome: 'unknown'
    })

    await chooseOption(user, 'Status', 'Done')

    const status = await screen.findByRole('combobox', { name: 'Status' })
    await screen.findByRole('status')
    await waitFor(() => expect(status.getAttribute('aria-disabled')).toBe('true'))
    expect(status.parentElement?.getAttribute('title')).toContain('notice above')
    expect(screen.getByRole('combobox', { name: 'Priority' }).hasAttribute('aria-disabled')).toBe(
      false
    )
    await user.click(within(screen.getByRole('status')).getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(status.hasAttribute('aria-disabled')).toBe(false))
  })
})

describe('detail focus and escape while saving', () => {
  it('keeps focus on the trigger while a save runs and refuses to open it', async () => {
    const user = userEvent.setup()
    const { host } = openDetail()
    const release = host.hold('dart.updateTask')
    const status = await screen.findByRole('combobox', { name: 'Status' })

    await chooseOption(user, 'Status', 'Done')
    await waitFor(() => expect(status.getAttribute('aria-disabled')).toBe('true'))
    expect(document.activeElement).toBe(status)

    await user.keyboard('{Enter}')
    await user.click(status)
    expect(screen.queryByRole('option')).toBeNull()
    expect(document.activeElement).toBe(status)
    release()
    await waitFor(() => expect(status.hasAttribute('aria-disabled')).toBe(false))
    expect(document.activeElement).toBe(status)
  })

  it('keeps focus on a picker trigger while its save runs', async () => {
    const user = userEvent.setup()
    const { host } = openDetail()
    const release = host.hold('dart.updateTask')
    const assignee = await screen.findByRole('combobox', { name: 'Assignee' })

    await user.click(assignee)
    await user.click(await screen.findByRole('option', { name: 'Sam Example' }))
    await waitFor(() => expect(assignee.getAttribute('aria-disabled')).toBe('true'))
    expect(document.activeElement).toBe(assignee)
    await user.keyboard('{Enter}')
    expect(screen.queryByRole('option')).toBeNull()
    release()
  })

  it('freezes the tag items while tags are pending', async () => {
    const user = userEvent.setup()
    const { host } = openDetail()
    const release = host.hold('dart.updateTask')

    await user.click(await screen.findByRole('button', { name: 'Tags' }))
    await user.click(await screen.findByRole('option', { name: 'search' }))
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'backend' }).getAttribute('aria-disabled')).toBe(
        'true'
      )
    )
    await user.click(screen.getByRole('option', { name: 'backend' }))
    expect(host.count('dart.updateTask')).toBe(1)
    release()
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'backend' }).getAttribute('aria-disabled')).toBe(
        'false'
      )
    )
  })

  it('reverts the title on Escape without closing the sheet', async () => {
    const user = userEvent.setup()
    const { onClose, host } = openDetail()
    const title = textarea(await screen.findByRole('textbox', { name: 'Title' }))

    await user.clear(title)
    await user.type(title, 'Typing…{Escape}')

    expect(title.value).toBe('Example task')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(host.count('dart.updateTask')).toBe(0)

    await user.click(screen.getByRole('button', { name: 'Close Dart task preview' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('keeps the sheet open when Escape ends a date edit', async () => {
    const user = userEvent.setup()
    const { onClose } = openDetail()
    const due = await screen.findByLabelText('Due')

    await user.click(due)
    fireEvent.change(due, { target: { value: '2026-12-24' } })
    await user.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('collapses pasted newlines in the title', async () => {
    const { host } = openDetail()
    const title = textarea(await screen.findByRole('textbox', { name: 'Title' }))

    fireEvent.change(title, { target: { value: 'First line\n  second line\r\nthird' } })
    fireEvent.blur(title)
    await waitFor(() =>
      expect(lastUpdate(host).updates).toEqual({ title: 'First line second line third' })
    )
  })
})

describe('detail fix round 2', () => {
  it('ignores typeahead on a busy status select', async () => {
    const user = userEvent.setup()
    const { host } = openDetail()
    const release = host.hold('dart.updateTask')
    const status = await screen.findByRole('combobox', { name: 'Status' })
    await chooseOption(user, 'Status', 'Done')
    await waitFor(() => expect(status.getAttribute('aria-disabled')).toBe('true'))

    status.focus()
    await user.keyboard('t')
    expect(host.count('dart.updateTask')).toBe(1)
    release()
  })

  it('clears a dirty date draft with exactly one null write and keeps focus on the input', async () => {
    const user = userEvent.setup()
    const { host } = openDetail()
    const due = await screen.findByLabelText('Due')
    fireEvent.change(due, { target: { value: '2026-11-20' } })
    fireEvent.blur(due)
    await waitFor(() => expect(lastUpdate(host).updates).toEqual({ dueAt: '2026-11-20' }))
    await waitFor(() => expect(due.hasAttribute('aria-disabled')).toBe(false))
    const release = host.hold('dart.updateTask')

    await user.click(due)
    fireEvent.change(due, { target: { value: '2026-12-24' } })
    const clear = screen.getByRole('button', { name: 'Clear Due' })
    expect(fireEvent.mouseDown(clear)).toBe(false)
    fireEvent.click(clear)

    await waitFor(() => expect(lastUpdate(host).updates).toEqual({ dueAt: null }))
    expect(host.count('dart.updateTask')).toBe(2)
    expect(document.activeElement).toBe(due)
    release()
  })

  it('keeps focus on the date and title after Enter while saving', async () => {
    const user = userEvent.setup()
    const { host } = openDetail()
    const release = host.hold('dart.updateTask')
    const start = await screen.findByLabelText('Start')

    await user.click(start)
    fireEvent.change(start, { target: { value: '2026-12-02' } })
    await user.keyboard('{Enter}')
    await waitFor(() => expect(lastUpdate(host).updates).toEqual({ startAt: '2026-12-02' }))
    expect(document.activeElement).toBe(start)
    release()
    await waitFor(() => expect(start.hasAttribute('aria-disabled')).toBe(false))

    const title = textarea(await screen.findByRole('textbox', { name: 'Title' }))
    const releaseTitle = host.hold('dart.updateTask')
    await user.clear(title)
    await user.type(title, 'Renamed{Enter}')
    await waitFor(() => expect(lastUpdate(host).updates).toEqual({ title: 'Renamed' }))
    expect(document.activeElement).toBe(title)
    releaseTitle()
  })

  it('dims a busy row and refuses pointer events on its controls', async () => {
    const user = userEvent.setup()
    const { host } = openDetail()
    const release = host.hold('dart.updateTask')
    const status = await screen.findByRole('combobox', { name: 'Status' })
    expect(status.parentElement!.className).not.toContain('opacity-60')

    await chooseOption(user, 'Status', 'Done')
    await waitFor(() => expect(status.parentElement!.className).toContain('opacity-60'))
    expect(status.parentElement!.className).toContain('cursor-not-allowed')
    release()
  })
})

describe('detail picker keyboard', () => {
  it('opens a picker with Enter, closes it with Escape and returns focus to its trigger', async () => {
    const user = userEvent.setup()
    openDetail()
    const trigger = await screen.findByRole('combobox', { name: 'Assignee' })

    trigger.focus()
    await user.keyboard('{Enter}')
    await screen.findByRole('option', { name: 'Unassigned' })

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('option', { name: 'Unassigned' })).toBeNull())
    expect(document.activeElement).toBe(trigger)
  })

  it('opens a select with Space and Enter and closes it with Escape, focus back on the trigger', async () => {
    const user = userEvent.setup()
    openDetail()
    const status = await screen.findByRole('combobox', { name: 'Status' })

    for (const key of [' ', '{Enter}']) {
      status.focus()
      await user.keyboard(key)
      await screen.findByRole('option', { name: 'Done' })
      await user.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('option', { name: 'Done' })).toBeNull())
      expect(document.activeElement).toBe(status)
    }
  })

  it('tabs through the controls in reading order', async () => {
    const user = userEvent.setup()
    openDetail()
    ;(await screen.findByRole('textbox', { name: 'Title' })).focus()
    const order = ['Status', 'Priority', 'Assignee', 'Size', 'Start', 'Due', 'Dartboard', 'Tags']
    const seen: string[] = []
    for (let step = 0; step < 24; step += 1) {
      await user.tab()
      const label = document.activeElement?.getAttribute('aria-label') ?? ''
      if (order.includes(label) && !seen.includes(label)) {
        seen.push(label)
      }
    }
    expect(seen).toEqual(order)
  })
})
