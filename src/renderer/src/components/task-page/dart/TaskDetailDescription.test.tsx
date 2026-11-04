// @vitest-environment happy-dom

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type * as AppHttpLink from '@/lib/app-http-link-open'
import { getShortcutPlatform } from '@/lib/shortcut-platform'
import type { FakeDartHost } from '@/store/slices/dart/dart-fake-runtime.test-support'
import { createCompatibleRuntimeStatusResponse } from '@/runtime/runtime-compatibility-test-fixture'
import { DART_WRITES_V2_RUNTIME_CAPABILITY } from '../../../../../shared/dart/dart-capabilities'
import type { DartDescriptionUpdate } from './dart-description-patch'
import { applyLikeDart, DartRefused } from './dart-description-reference.test-support'
import type { DartDetailDescriptionApi, DartWriteNotice } from './dart-detail-contracts'
import { clearDraft, dartDraftKey, oldestDirtyDraft, setDraft } from './dart-draft-store'
import {
  openRenderedDartDetail,
  setUpRenderedDartDetail,
  tearDownRenderedDartDetail
} from './dart-task-detail.test-support'
import { DartTaskDetailDescription } from './TaskDetailDescription'

const links = vi.hoisted(() => ({ open: vi.fn() }))
vi.mock('@/lib/app-http-link-open', async (importOriginal) => ({
  ...(await importOriginal<typeof AppHttpLink>()),
  openAppHttpLink: links.open
}))

const realWindow = window
const writeClipboardText = vi.fn().mockResolvedValue(undefined)
const BASE = 'First paragraph stays as it is.\n\nSecond paragraph gets the edit.'
const REFUSED = {
  ok: false,
  error: 'Dart did not accept this change.',
  errorCode: 'dart.descriptionPatchRefused',
  outcome: 'notApplied'
} as const
const LOST = {
  ok: false,
  error: 'Failed to update Dart task.',
  errorCode: 'dart.updateFailed',
  outcome: 'unknown'
} as const

// T4b's sheet prevents the dismissal for Esc inside this marker; TaskDetail.tsx is not this task's file, so this does the same.
function honourEscapeLocal(event: KeyboardEvent): void {
  if (
    event.key === 'Escape' &&
    event.target instanceof Element &&
    event.target.closest('[data-dart-escape-local]')
  ) {
    event.preventDefault()
  }
}

beforeEach(() => {
  realWindow.addEventListener('keydown', honourEscapeLocal, { capture: true })
  writeClipboardText.mockClear()
  links.open.mockClear()
  setUpRenderedDartDetail()
  Object.assign(window.api, { ui: { writeClipboardText } })
})

afterEach(() => {
  realWindow.removeEventListener('keydown', honourEscapeLocal, { capture: true })
  tearDownRenderedDartDetail()
  // The draft store is one per session, and dirty drafts here would count against the limit.
  for (let oldest = oldestDirtyDraft(); oldest; oldest = oldestDirtyDraft()) {
    clearDraft(oldest.key)
  }
})

function setDescription(host: FakeDartHost, id: string, description: string): void {
  host.tasks.set(id, { ...host.tasks.get(id)!, description })
}

/** The shared fake answers every patch with fixed text; this host applies Dart's real rules. */
function applyPatchesLikeDart(host: FakeDartHost, beforeWrite?: () => void): void {
  const handle = host.handle.bind(host)
  host.handle = async (method, params) => {
    if (method !== 'dart.updateTaskDescription') {
      return handle(method, params)
    }
    beforeWrite?.()
    const id = params.taskId ?? ''
    const before = host.tasks.get(id)?.description ?? ''
    // SAFETY: the fake's params type covers `dart.updateTask`; this method's `updates` is the patch array.
    const updates = params.updates as unknown as DartDescriptionUpdate[]
    let patched: string
    try {
      patched = applyLikeDart(before, updates)
    } catch (error) {
      if (error instanceof DartRefused) {
        host.requests.push({ method, params })
        return REFUSED
      }
      throw error
    }
    const reply = await handle(method, params)
    if (host.tasks.get(id)?.description !== before) {
      setDescription(host, id, patched)
    }
    return 'ok' in reply && reply.ok ? { ok: true, task: host.tasks.get(id) } : reply
  }
}

async function openWith(description: string) {
  const detail = openRenderedDartDetail()
  const task = detail.addTask('desc')
  const shown = { ...task, description }
  detail.host.addTask(shown)
  detail.showTask(shown)
  await screen.findByRole('heading', { name: 'Description' })
  return { ...detail, task: shown }
}

async function startEditing(
  user: ReturnType<typeof userEvent.setup>
): Promise<HTMLTextAreaElement> {
  await user.click(await screen.findByRole('button', { name: 'Edit' }))
  const textarea = await screen.findByRole('textbox', { name: 'Description (Markdown)' })
  return textarea as HTMLTextAreaElement
}

function typeInto(textarea: HTMLTextAreaElement, text: string): void {
  fireEvent.change(textarea, { target: { value: text } })
}

async function editToDraft(
  user: ReturnType<typeof userEvent.setup>,
  text: string
): Promise<HTMLTextAreaElement> {
  const textarea = await startEditing(user)
  typeInto(textarea, text)
  return textarea
}

function saveButton(): HTMLElement {
  return screen.getByRole('button', { name: /^(Save|Saving…)/ })
}

function expectNoFullDescriptionWrite(host: FakeDartHost): void {
  for (const { params } of host.requests.filter(({ method }) => method === 'dart.updateTask')) {
    expect(params.updates).not.toHaveProperty('description')
  }
}

describe('saving a description', () => {
  it('reads first, then sends only the changed text and shows the reply', async () => {
    const user = userEvent.setup()
    const { host, task } = await openWith(BASE)
    applyPatchesLikeDart(host)
    await editToDraft(user, BASE.replace('gets the edit', 'got an edit'))
    const readsBefore = host.count('dart.getTask')

    await user.click(saveButton())
    await screen.findByRole('button', { name: 'Edit' })

    const methods = host.requests.map(({ method }) => method)
    const sentAt = methods.indexOf('dart.updateTaskDescription')
    expect(methods.slice(0, sentAt).filter((m) => m === 'dart.getTask').length).toBeGreaterThan(
      readsBefore
    )
    expect(host.count('dart.updateTaskDescription')).toBe(1)
    const { params } = host.requests[sentAt]
    expect(params).not.toHaveProperty('description')
    expect(JSON.stringify(params)).not.toContain('occurrence')
    expect(JSON.stringify(params)).not.toContain('First paragraph')
    expect(host.tasks.get(task.id)?.description).toBe(BASE.replace('gets the edit', 'got an edit'))
    expect(await screen.findByText(/got an edit/)).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit' }))
    expectNoFullDescriptionWrite(host)
  })

  it('shows what the reply holds, never the local draft', async () => {
    const user = userEvent.setup()
    const { host } = await openWith(BASE)
    await editToDraft(user, `${BASE} My draft.`)

    await user.click(saveButton())

    // The shared fake answers every patch with this text.
    expect(await screen.findByText('patched description')).toBeTruthy()
    expect(screen.queryByText(/My draft/)).toBeNull()
    expect(host.count('dart.updateTaskDescription')).toBe(1)
  })

  it('keeps Save disabled while nothing changed', async () => {
    const user = userEvent.setup()
    await openWith(BASE)
    const textarea = await startEditing(user)
    expect(saveButton().hasAttribute('disabled')).toBe(true)
    typeInto(textarea, `${BASE}!`)
    expect(saveButton().hasAttribute('disabled')).toBe(false)
    typeInto(textarea, BASE)
    expect(saveButton().hasAttribute('disabled')).toBe(true)
  })

  it('sends nothing and keeps the draft when the pre-save read fails', async () => {
    const user = userEvent.setup()
    const { host } = await openWith(BASE)
    const textarea = await editToDraft(user, `${BASE} Mine.`)

    host.failReads = true
    await user.click(saveButton())

    expect((await screen.findByRole('alert')).textContent).toContain(
      "Couldn't check Dart before saving"
    )
    expect(host.count('dart.updateTaskDescription')).toBe(0)
    expect(textarea.value).toBe(`${BASE} Mine.`)
    expect(saveButton().hasAttribute('disabled')).toBe(false)
  })

  it('sends nothing for a base with no unique anchor and keeps the draft with the message', async () => {
    const user = userEvent.setup()
    const lines = Array.from({ length: 2000 }, () => 'same line').join('\n')
    const { host } = await openWith(lines)
    const edited = lines.split('\n').toSpliced(1000, 1, 'other line').join('\n')
    const textarea = await editToDraft(user, edited)

    await user.click(saveButton())

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('appears more than once')
    expect(within(alert).getByRole('button', { name: 'Copy my text' })).toBeTruthy()
    expect(within(alert).getByRole('button', { name: 'Open in Dart' })).toBeTruthy()
    expect(host.count('dart.updateTaskDescription')).toBe(0)
    expect(textarea.value).toBe(edited)
  })

  it('keeps Save disabled through a slow save, whichever way it is pressed', async () => {
    const user = userEvent.setup()
    const { host } = await openWith(BASE)
    const textarea = await editToDraft(user, `${BASE} Mine.`)
    const release = host.hold('dart.updateTaskDescription')
    const modifier = getShortcutPlatform() === 'darwin' ? { metaKey: true } : { ctrlKey: true }

    await user.click(saveButton())
    await waitFor(() => expect(host.count('dart.updateTaskDescription')).toBe(1))

    const button = saveButton()
    expect(button.hasAttribute('disabled')).toBe(true)
    expect(button.getAttribute('aria-busy')).toBe('true')
    // Both labels stay in one grid cell, so the swap cannot move the layout.
    expect(button.textContent).toBe('SaveSaving…')
    expect(within(button).getByText('Save').className).toContain('invisible')
    expect(within(button).getByText('Saving…').className).not.toContain('invisible')

    fireEvent.keyDown(textarea, { key: 'Enter', ...modifier })
    await act(async () => {})
    expect(host.count('dart.updateTaskDescription')).toBe(1)

    release()
    await screen.findByRole('button', { name: 'Edit' })
    expect(host.count('dart.updateTaskDescription')).toBe(1)
  })

  it('picks up a slow save after switching away and back', async () => {
    const user = userEvent.setup()
    const { host, addTask, showTask, task } = await openWith(BASE)
    await editToDraft(user, `${BASE} Mine.`)
    const release = host.hold('dart.updateTaskDescription')
    await user.click(saveButton())
    await waitFor(() => expect(host.count('dart.updateTaskDescription')).toBe(1))

    showTask(addTask('other'))
    await screen.findByRole('button', { name: 'Edit' })
    showTask(task)

    await screen.findByRole('textbox', { name: 'Description (Markdown)' })
    expect(saveButton().hasAttribute('disabled')).toBe(true)
    release()
    expect(await screen.findByText('patched description')).toBeTruthy()
    expect(host.count('dart.updateTaskDescription')).toBe(1)
  })
})

describe('discarding during a slow save', () => {
  it('leaves a new edit alone when the old save settles', async () => {
    const user = userEvent.setup()
    const { host } = await openWith(BASE)
    await editToDraft(user, `${BASE} Mine.`)
    const release = host.hold('dart.updateTaskDescription')
    await user.click(saveButton())
    await waitFor(() => expect(host.count('dart.updateTaskDescription')).toBe(1))

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(
      within(await screen.findByRole('dialog', { name: /Discard unsaved/ })).getByRole('button', {
        name: 'Discard'
      })
    )
    await startEditing(user)
    release()

    await screen.findByText('Saving…')
    await waitFor(() => expect(saveButton().getAttribute('aria-busy')).toBe('false'))
    expect(screen.getByRole('textbox', { name: 'Description (Markdown)' })).toBeTruthy()
    expect(host.count('dart.updateTaskDescription')).toBe(1)
  })
})

describe('a refused patch', () => {
  it('stays neutral with the draft when Dart still holds the base', async () => {
    const user = userEvent.setup()
    const { host } = await openWith(BASE)
    const textarea = await editToDraft(user, `${BASE} Mine.`)
    host.refusals.push(REFUSED)

    await user.click(saveButton())

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Dart did not accept this change.')
    expect(screen.queryByRole('dialog', { name: /changed in Dart/ })).toBeNull()
    expect(textarea.value).toBe(`${BASE} Mine.`)

    await user.click(within(alert).getByRole('button', { name: 'Copy my text' }))
    expect(writeClipboardText).toHaveBeenCalledWith(`${BASE} Mine.`)
    await user.click(within(alert).getByRole('button', { name: 'Open in Dart' }))
    expect(links.open).toHaveBeenCalledTimes(1)
    expect(saveButton().hasAttribute('disabled')).toBe(false)
  })

  it('opens the dialog with only its two actions when Dart changed', async () => {
    const user = userEvent.setup()
    const { host, task } = await openWith(BASE)
    await editToDraft(user, BASE.replace('gets the edit', 'got an edit'))
    host.refusals.push(REFUSED)
    const handle = host.handle.bind(host)
    host.handle = async (method, params) => {
      const reply = await handle(method, params)
      if (method === 'dart.updateTaskDescription') {
        setDescription(host, task.id, `Remote top.\n\n${BASE}`)
      }
      return reply
    }

    await user.click(saveButton())

    const dialog = await screen.findByRole('dialog', { name: /changed in Dart/ })
    expect(
      within(dialog)
        .getAllByRole('button')
        .map((button) => button.textContent)
    ).toEqual(['Copy', 'Discard my changes', 'Back to editing'])
    expect(screen.queryByRole('alert')).toBeNull()
    expect(host.count('dart.updateTaskDescription')).toBe(1)
  })

  it('ends in the fresh read and the dialog when an identical copy lands before the write', async () => {
    const user = userEvent.setup()
    const { host, task } = await openWith(BASE)
    applyPatchesLikeDart(host, () => setDescription(host, task.id, `${BASE}\n\n${BASE}`))
    await editToDraft(user, BASE.replace('gets the edit', 'got an edit'))

    await user.click(saveButton())

    expect(await screen.findByRole('dialog', { name: /changed in Dart/ })).toBeTruthy()
    expect(host.tasks.get(task.id)?.description).toBe(`${BASE}\n\n${BASE}`)
    expect(host.count('dart.updateTaskDescription')).toBe(1)
  })
})

describe('the conflict flow', () => {
  const clash = BASE.replace('Second paragraph gets the edit.', 'Second paragraph was remote.')
  const remote = `Remote top.\n\n${clash}`
  const mine = BASE.replace('stays as it is', 'stays changed').replace(
    'gets the edit',
    'got my edit'
  )

  async function reachConflict(user: ReturnType<typeof userEvent.setup>) {
    const detail = await openWith(BASE)
    applyPatchesLikeDart(detail.host)
    await editToDraft(user, mine)
    setDescription(detail.host, detail.task.id, remote)
    await user.click(saveButton())
    return { ...detail, dialog: await screen.findByRole('dialog', { name: /changed in Dart/ }) }
  }

  it('a pre-save read that differs sends nothing and shows Dart and the editor text', async () => {
    const user = userEvent.setup()
    const { host, dialog } = await reachConflict(user)
    expect(host.count('dart.updateTaskDescription')).toBe(0)
    expect(dialog.textContent).toContain('Remote top.')
    expect(screen.getByTestId('dart-description-conflict-editor-text').textContent).toBe(mine)
    expect(within(dialog).getAllByText('got my edit.', { exact: false }).length).toBeGreaterThan(0)

    await user.click(within(dialog).getByRole('button', { name: 'Copy' }))
    expect(writeClipboardText).toHaveBeenCalledWith(mine)
    expectNoFullDescriptionWrite(host)
  })

  it('Discard my changes sends nothing and shows what Dart holds', async () => {
    const user = userEvent.setup()
    const { host, dialog } = await reachConflict(user)

    await user.click(within(dialog).getByRole('button', { name: 'Discard my changes' }))

    await screen.findByRole('button', { name: 'Edit' })
    expect(await screen.findByText('Remote top.')).toBeTruthy()
    expect(screen.queryByText(/stays changed/)).toBeNull()
    expect(host.count('dart.updateTaskDescription')).toBe(0)
  })

  it('Esc is Back to editing, which loses nothing', async () => {
    const user = userEvent.setup()
    await reachConflict(user)
    await user.keyboard('{Escape}')
    const textarea = await screen.findByRole('textbox', { name: 'Description (Markdown)' })
    expect((textarea as HTMLTextAreaElement).value).toContain('stays changed')
  })

  it('Back to editing merges, lists the hunk, and keeps it through everything until removed', async () => {
    const user = userEvent.setup()
    const { host, dialog, task, showTask, addTask } = await reachConflict(user)
    expect(dialog.textContent).toContain('got my edit'.split(' ')[0])

    await user.click(within(dialog).getByRole('button', { name: 'Back to editing' }))

    const textarea = (await screen.findByRole('textbox', {
      name: 'Description (Markdown)'
    })) as HTMLTextAreaElement
    expect(textarea.value).toBe(
      `Remote top.\n\n${clash.replace('stays as it is', 'stays changed')}`
    )
    const hunkCount = (): number => screen.getAllByRole('button', { name: 'Mark resolved' }).length
    const firstCount = hunkCount()
    expect(firstCount).toBeGreaterThan(0)

    // Reopening the panel and switching tasks both keep the lineage.
    showTask(null)
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())
    showTask(task)
    await screen.findByRole('textbox', { name: 'Description (Markdown)' })
    expect(hunkCount()).toBe(firstCount)
    showTask(addTask('other'))
    await screen.findByRole('button', { name: 'Edit' })
    expect(screen.queryByRole('button', { name: 'Mark resolved' })).toBeNull()
    showTask(task)
    const reopened = (await screen.findByRole('textbox', {
      name: 'Description (Markdown)'
    })) as HTMLTextAreaElement
    expect(hunkCount()).toBe(firstCount)

    // A second conflict rebases the typed text, keeps the stored hunks and shows the current text.
    const typed = `${reopened.value}\n\nA sentence I added.`
    typeInto(reopened, typed)
    setDescription(host, task.id, `${remote}\n\nRemote bottom.`)
    await user.click(saveButton())
    const second = await screen.findByRole('dialog', { name: /changed in Dart/ })
    expect(screen.getByTestId('dart-description-conflict-editor-text').textContent).toBe(typed)
    expect(host.count('dart.updateTaskDescription')).toBe(0)
    await user.click(within(second).getByRole('button', { name: 'Back to editing' }))
    const merged = (await screen.findByRole('textbox', {
      name: 'Description (Markdown)'
    })) as HTMLTextAreaElement
    expect(merged.value).toContain('A sentence I added.')
    expect(merged.value).toContain('Remote bottom.')
    expect(merged.value).toContain('stays changed')
    expect(hunkCount()).toBe(firstCount)
    await user.click(screen.getAllByRole('button', { name: 'Mark resolved' })[0])
    expect(screen.queryAllByRole('button', { name: 'Mark resolved' })).toHaveLength(firstCount - 1)
  })

  it('a save keeps unresolved hunks listed and Discard this change removes only that one', async () => {
    const user = userEvent.setup()
    const { dialog } = await reachConflict(user)
    await user.click(within(dialog).getByRole('button', { name: 'Back to editing' }))
    await screen.findByRole('textbox', { name: 'Description (Markdown)' })
    const before = screen.getAllByRole('button', { name: 'Discard this change' }).length

    await user.click(saveButton())

    await waitFor(() => expect(saveButton().getAttribute('aria-busy')).toBe('false'))
    await waitFor(() => expect(saveButton().hasAttribute('disabled')).toBe(true))
    expect(screen.getAllByRole('button', { name: 'Discard this change' })).toHaveLength(before)
    await user.click(screen.getAllByRole('button', { name: 'Discard this change' })[0])
    expect(screen.queryAllByRole('button', { name: 'Discard this change' })).toHaveLength(
      before - 1
    )
  })
})

describe('a save with an unknown outcome', () => {
  it('never resends, says Dart shows the text, and finishes on Dismiss when the write landed', async () => {
    const user = userEvent.setup()
    const { host, task } = await openWith(BASE)
    const mine = `${BASE} Mine.`
    applyPatchesLikeDart(host)
    await editToDraft(user, mine)
    host.lostReplies.push(LOST)

    await user.click(saveButton())

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('Dart now shows your text')
    )
    const status = screen.getByRole('status')
    expect(within(status).getByRole('button', { name: 'Check again' })).toBeTruthy()
    expect(within(status).getByRole('button', { name: 'Copy my text' })).toBeTruthy()
    expect(within(status).getByRole('button', { name: 'Open in Dart' })).toBeTruthy()
    expect(saveButton().hasAttribute('disabled')).toBe(true)
    expect(host.count('dart.updateTaskDescription')).toBe(1)

    await user.click(within(status).getByRole('button', { name: 'Dismiss' }))

    await screen.findByRole('button', { name: 'Edit' })
    expect(host.count('dart.updateTaskDescription')).toBe(1)
    expect(host.tasks.get(task.id)?.description).toBe(mine)
  })

  it('opens the dialog when the read shows neither the base nor the intended text', async () => {
    const user = userEvent.setup()
    const { host, task } = await openWith(BASE)
    await editToDraft(user, `${BASE} Mine.`)
    host.lostReplies.push(LOST)
    const handle = host.handle.bind(host)
    host.handle = async (method, params) => {
      const reply = await handle(method, params)
      if (method === 'dart.updateTaskDescription') {
        setDescription(host, task.id, 'Somebody rewrote this in Dart.')
      }
      return reply
    }

    await user.click(saveButton())

    expect(await screen.findByRole('dialog', { name: /changed in Dart/ })).toBeTruthy()
    expect(host.count('dart.updateTaskDescription')).toBe(1)
  })

  it('stays blocked with the draft while Dart still shows the base, then Check again can open the dialog', async () => {
    const user = userEvent.setup()
    const { host, task } = await openWith(BASE)
    const textarea = await editToDraft(user, `${BASE} Mine.`)
    host.transportError = new Error('socket closed')

    await user.click(saveButton())

    const status = await screen.findByRole('status')
    expect(status.textContent).toContain('Dart may have applied this change')
    expect(textarea.value).toBe(`${BASE} Mine.`)
    await waitFor(() => expect(saveButton().getAttribute('aria-busy')).toBe('false'))
    expect(saveButton().hasAttribute('disabled')).toBe(true)

    setDescription(host, task.id, 'Somebody rewrote this in Dart.')
    await user.click(within(status).getByRole('button', { name: 'Check again' }))
    expect(await screen.findByRole('dialog', { name: /changed in Dart/ })).toBeTruthy()
    expect(host.count('dart.updateTaskDescription')).toBe(1)
  })

  it('offers Save again once the user dismisses an unconfirmed write', async () => {
    const user = userEvent.setup()
    const { host } = await openWith(BASE)
    await editToDraft(user, `${BASE} Mine.`)
    host.transportError = new Error('socket closed')
    await user.click(saveButton())
    const status = await screen.findByRole('status')
    await waitFor(() => expect(saveButton().getAttribute('aria-busy')).toBe('false'))

    await user.click(within(status).getByRole('button', { name: 'Dismiss' }))

    await waitFor(() => expect(saveButton().hasAttribute('disabled')).toBe(false))
    expect(host.count('dart.updateTaskDescription')).toBe(1)
  })
})

describe('read-only states', () => {
  function expectReadOnlyActions(): void {
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Open in Dart' }).length).toBeGreaterThan(0)
  }

  it('an empty description offers no Edit', async () => {
    await openWith('')
    await screen.findByText('No description yet. Add one in Dart.')
    expectReadOnlyActions()
  })

  it('a host without writes v2 offers no Edit and copies the text', async () => {
    const user = userEvent.setup()
    const call = window.api.runtimeEnvironments.call
    Object.assign(window.api.runtimeEnvironments, {
      call: async (args: { selector: string; method: string }) => {
        if (args.method !== 'status.get') {
          return call(args as Parameters<typeof call>[0])
        }
        const status = createCompatibleRuntimeStatusResponse(args.selector)
        status.result.capabilities = status.result.capabilities.filter(
          (capability) => capability !== DART_WRITES_V2_RUNTIME_CAPABILITY
        )
        return status
      }
    })
    await openWith(BASE)

    await screen.findByText('Update the remote Orca server to edit descriptions.')
    expectReadOnlyActions()
    await user.click(screen.getByRole('button', { name: 'Copy' }))
    expect(writeClipboardText).toHaveBeenCalledWith(BASE)
  })
})

describe('keyboard and close guard', () => {
  it('Esc on a clean editor leaves editing, not the task, and refocuses Edit', async () => {
    const user = userEvent.setup()
    const { onClose } = await openWith(BASE)
    await startEditing(user)
    expect(document.activeElement?.tagName).toBe('TEXTAREA')

    await user.keyboard('{Escape}')

    const edit = await screen.findByRole('button', { name: 'Edit' })
    await waitFor(() => expect(document.activeElement).toBe(edit))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Esc on a dirty editor asks first; Cancel keeps the draft, Discard refocuses Edit', async () => {
    const user = userEvent.setup()
    const { onClose } = await openWith(BASE)
    const textarea = await editToDraft(user, `${BASE} Mine.`)
    textarea.focus()

    await user.keyboard('{Escape}')
    const prompt = await screen.findByRole('dialog', { name: /Discard unsaved/ })
    await user.click(within(prompt).getByRole('button', { name: 'Cancel' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /Discard unsaved/ })).toBeNull()
    )
    expect(textarea.value).toBe(`${BASE} Mine.`)

    textarea.focus()
    await user.keyboard('{Escape}')
    await user.click(
      within(await screen.findByRole('dialog', { name: /Discard unsaved/ })).getByRole('button', {
        name: 'Discard'
      })
    )
    const edit = await screen.findByRole('button', { name: 'Edit' })
    await waitFor(() => expect(document.activeElement).toBe(edit))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Esc in the prompt answers it without asking again', async () => {
    const user = userEvent.setup()
    await openWith(BASE)
    const textarea = await editToDraft(user, `${BASE} Mine.`)
    textarea.focus()

    await user.keyboard('{Escape}')
    await screen.findByRole('dialog', { name: /Discard unsaved/ })
    await user.keyboard('{Escape}')

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /Discard unsaved/ })).toBeNull()
    )
    await act(async () => {})
    expect(screen.queryByRole('dialog', { name: /Discard unsaved/ })).toBeNull()
    expect(textarea.value).toBe(`${BASE} Mine.`)
  })

  it('Close asks while dirty; Cancel stays, Discard closes', async () => {
    const user = userEvent.setup()
    const { onClose } = await openWith(BASE)
    await editToDraft(user, `${BASE} Mine.`)
    const close = screen.getByRole('button', { name: 'Close Dart task preview' })

    await user.click(close)
    await user.click(
      within(await screen.findByRole('dialog', { name: /Discard unsaved/ })).getByRole('button', {
        name: 'Cancel'
      })
    )
    await act(async () => {})
    expect(onClose).not.toHaveBeenCalled()

    await user.click(close)
    await user.click(
      within(await screen.findByRole('dialog', { name: /Discard unsaved/ })).getByRole('button', {
        name: 'Discard'
      })
    )
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('answers a pending close guard when the task switches, so Close keeps working', async () => {
    const user = userEvent.setup()
    const { onClose, addTask, showTask } = await openWith(BASE)
    await editToDraft(user, `${BASE} Mine.`)

    await user.click(screen.getByRole('button', { name: 'Close Dart task preview' }))
    await screen.findByRole('dialog', { name: /Discard unsaved/ })
    showTask(addTask('other'))
    await screen.findByRole('button', { name: 'Edit' })
    await act(async () => {})

    await user.click(screen.getByRole('button', { name: 'Close Dart task preview' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('an Enter inside an IME composition does not save; the shortcut does', async () => {
    const user = userEvent.setup()
    const { host } = await openWith(BASE)
    const textarea = await editToDraft(user, `${BASE} Mine.`)
    const modifier = getShortcutPlatform() === 'darwin' ? { metaKey: true } : { ctrlKey: true }

    fireEvent.compositionStart(textarea)
    fireEvent.keyDown(textarea, { key: 'Enter', isComposing: true, ...modifier })
    fireEvent.keyDown(textarea, { key: 'Enter', keyCode: 229, ...modifier })
    await act(async () => {})
    expect(host.count('dart.updateTaskDescription')).toBe(0)
    fireEvent.compositionEnd(textarea, { data: 'x' })

    fireEvent.keyDown(textarea, { key: 'Enter' })
    await act(async () => {})
    expect(host.count('dart.updateTaskDescription')).toBe(0)

    await user.keyboard('{Shift}') // End the composition gesture before the real shortcut.
    fireEvent.keyDown(textarea, { key: 'Enter', ...modifier })
    await waitFor(() => expect(host.count('dart.updateTaskDescription')).toBe(1))
  })

  it('shows the preview without losing the draft', async () => {
    const user = userEvent.setup()
    await openWith(BASE)
    const textarea = await editToDraft(user, `${BASE}\n\n**bold words**`)

    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect((await screen.findByText('bold words')).tagName).toBe('STRONG')

    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(textarea.value).toContain('**bold words**')
  })
})

describe('a CRLF description', () => {
  it('does not count line endings as a change and keeps them in the patch', async () => {
    const user = userEvent.setup()
    const crlf = 'First line here\r\nSecond line here\r\nThird line here'
    const { host, task } = await openWith(crlf)
    applyPatchesLikeDart(host)
    const textarea = await startEditing(user)
    expect(saveButton().hasAttribute('disabled')).toBe(true)

    typeInto(textarea, textarea.value.replace('Second', 'Next'))
    await user.click(saveButton())

    await screen.findByRole('button', { name: 'Edit' })
    expect(host.tasks.get(task.id)?.description).toBe(crlf.replace('Second', 'Next'))
  })
})

describe('the draft limit', () => {
  it('holds the new draft back until the oldest is copied and discarded', async () => {
    const user = userEvent.setup()
    for (let index = 0; index < 20; index += 1) {
      const key = dartDraftKey(
        { hostKey: 'limit-host', accountKey: 'a' },
        `oldTask${index}`,
        'comment'
      )
      setDraft(key, `old draft ${index}`, { dirty: true })
    }
    await openWith(BASE)
    const textarea = await startEditing(user)

    typeInto(textarea, `${BASE} Mine.`)
    const warning = await screen.findByRole('alert')
    expect(warning.textContent).toContain('oldTask0')
    expect(textarea.value).toBe(BASE)

    await user.click(within(warning).getByRole('button', { name: 'Copy' }))
    expect(writeClipboardText).toHaveBeenCalledWith('old draft 0')
    await user.click(within(warning).getByRole('button', { name: 'Discard it' }))
    expect(screen.queryByRole('alert')).toBeNull()

    typeInto(textarea, `${BASE} Mine.`)
    expect(textarea.value).toBe(`${BASE} Mine.`)
  })
})

describe('the description notice', () => {
  const notice: DartWriteNotice = {
    kind: 'unknown',
    field: 'description',
    message: 'Dart may have applied this change.'
  }

  function renderSection(
    description: DartDetailDescriptionApi['description'],
    shown: DartWriteNotice = notice
  ): void {
    const none: ReadonlySet<string> = new Set()
    const task = {
      id: 'tNoticeTask1',
      title: 'Task',
      htmlUrl: 'https://app.dartai.com/t/tNoticeTask1',
      status: 'To-do',
      priority: 'Medium',
      tags: []
    }
    render(
      <TooltipProvider>
        <DartTaskDetailDescription
          task={task}
          openUrl={task.htmlUrl}
          supportsWritesV2
          description={description}
          readLatestTask={() => Promise.reject(new Error('not used'))}
          onSavePatch={() => Promise.reject(new Error('not used'))}
          registerCloseGuard={() => () => {}}
          pendingFields={none}
          blockedFields={none}
          notice={{
            notice: shown,
            dismissNotice: () => {},
            recheckNotice: () => Promise.resolve()
          }}
          draftKey={dartDraftKey(
            { hostKey: 'notice-host', accountKey: 'a' },
            task.id,
            'description'
          )}
          onRetry={() => {}}
        />
      </TooltipProvider>
    )
  }

  it.each([
    ['loading', { status: 'loading' } as const],
    ['error', { status: 'error', message: 'Failed to load.' } as const],
    ['read-only', { status: 'ready', value: '' } as const],
    ['editable', { status: 'ready', value: BASE } as const]
  ])('shows in the %s state', (_name, description) => {
    renderSection(description)
    expect(screen.getByRole('status').textContent).toContain('Dart may have applied')
  })

  it('leaves another field’s notice alone', () => {
    renderSection({ status: 'ready', value: BASE }, { ...notice, field: 'status' })
    expect(screen.queryByRole('status')).toBeNull()
  })
})
