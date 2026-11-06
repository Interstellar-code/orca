// @vitest-environment happy-dom

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  applyPatchesLikeDart,
  BASE,
  clearDirtyDrafts,
  editToDraft,
  findEditorTextarea,
  honourEscapeLocal,
  LOST,
  openWith,
  REFUSED,
  saveButton,
  setDescription,
  typeInto
} from './dart-description-detail.test-support'
import { dartDraftKey, oldestDirtyDraft, setDraft } from './dart-draft-store'
import {
  setUpRenderedDartDetail,
  tearDownRenderedDartDetail
} from './dart-task-detail.test-support'
import { DartTaskDetailDescription } from './TaskDetailDescription'

const realWindow = window
const MINE = `${BASE} Mine.`
const SURE = 'Nothing was saved and nothing was overwritten'
const UNSURE = 'Dart may have saved part of this change'
const CHANGED_IN_DART = /changed in Dart/
const DISCARD_PROMPT = /Discard unsaved/

beforeEach(() => {
  realWindow.addEventListener('keydown', honourEscapeLocal, { capture: true })
  setUpRenderedDartDetail()
})

afterEach(() => {
  vi.useRealTimers()
  realWindow.removeEventListener('keydown', honourEscapeLocal, { capture: true })
  tearDownRenderedDartDetail()
  clearDirtyDrafts()
})

function findConflictDialog(): Promise<HTMLElement> {
  return screen.findByRole('dialog', { name: CHANGED_IN_DART })
}

function button(name: string): HTMLElement {
  return screen.getByRole('button', { name })
}

function expectDisabled(element: HTMLElement, disabled: boolean): void {
  expect(element.hasAttribute('disabled')).toBe(disabled)
}

/** Dart's text changes right after the patch arrives, whatever the fake replied. */
function changeDartAfterWrite(
  detail: Awaited<ReturnType<typeof openWith>>,
  description: string
): void {
  const { host, task } = detail
  const handle = host.handle.bind(host)
  host.handle = async (method, params) => {
    const reply = await handle(method, params)
    if (method === 'dart.updateTaskDescription') {
      setDescription(host, task.id, description)
    }
    return reply
  }
}

describe('the conflict dialog says what Orca knows', () => {
  it('is sure when the pre-save read stopped the patch, and focuses Back to editing', async () => {
    const user = userEvent.setup()
    const { host, task } = await openWith(BASE)
    await editToDraft(user, MINE)
    setDescription(host, task.id, `Remote top.\n\n${BASE}`)

    await user.click(saveButton())

    const dialog = await findConflictDialog()
    expect(dialog.textContent).toContain(SURE)
    expect(dialog.textContent).not.toContain(UNSURE)
    expect(host.count('dart.updateTaskDescription')).toBe(0)
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(dialog).getByRole('button', { name: 'Back to editing' })
      )
    )
  })

  it('is sure when Dart refused the patch', async () => {
    const user = userEvent.setup()
    const detail = await openWith(BASE)
    await editToDraft(user, MINE)
    detail.host.refusals.push(REFUSED)
    changeDartAfterWrite(detail, `Remote top.\n\n${BASE}`)

    await user.click(saveButton())

    expect((await findConflictDialog()).textContent).toContain(SURE)
  })

  it('stays neutral after an unknown outcome', async () => {
    const user = userEvent.setup()
    const detail = await openWith(BASE)
    await editToDraft(user, MINE)
    detail.host.lostReplies.push(LOST)
    changeDartAfterWrite(detail, 'Somebody rewrote this in Dart.')

    await user.click(saveButton())

    const dialog = await findConflictDialog()
    expect(dialog.textContent).toContain(UNSURE)
    expect(dialog.textContent).not.toContain(SURE)
  })

  it('stays neutral when Check again opens it, and on the next save after Dismiss', async () => {
    const user = userEvent.setup()
    const { host, task } = await openWith(BASE)
    await editToDraft(user, MINE)
    host.transportError = new Error('socket closed')
    await user.click(saveButton())
    const status = await screen.findByRole('status')

    setDescription(host, task.id, 'Somebody rewrote this in Dart.')
    await user.click(within(status).getByRole('button', { name: 'Check again' }))
    const dialog = await findConflictDialog()
    expect(dialog.textContent).toContain(UNSURE)

    await user.click(within(dialog).getByRole('button', { name: 'Back to editing' }))
    await user.click(
      within(await screen.findByRole('status')).getByRole('button', { name: 'Dismiss' })
    )
    host.transportError = null
    // The hunk did not rebase, so the draft needs new text before Save can run.
    typeInto(await findEditorTextarea(), 'Typed after the conflict.')
    setDescription(host, task.id, 'Rewritten once more.')
    await waitFor(() => expectDisabled(saveButton(), false))
    await user.click(saveButton())

    expect((await findConflictDialog()).textContent).toContain(UNSURE)
    expect(host.count('dart.updateTaskDescription')).toBe(1)
  })
})

describe('while a save is in flight', () => {
  it('Cancel, Esc and the close prompt cannot discard the draft', async () => {
    const user = userEvent.setup()
    const { host, onClose } = await openWith(BASE)
    const textarea = await editToDraft(user, MINE)
    const release = host.hold('dart.updateTaskDescription')
    await user.click(saveButton())
    await waitFor(() => expect(host.count('dart.updateTaskDescription')).toBe(1))

    expectDisabled(button('Cancel'), true)
    fireEvent.keyDown(textarea, { key: 'Escape' })
    await act(async () => {})
    expect(screen.queryByRole('dialog', { name: DISCARD_PROMPT })).toBeNull()

    await user.click(button('Close Dart task preview'))
    const prompt = await screen.findByRole('dialog', { name: DISCARD_PROMPT })
    expectDisabled(within(prompt).getByRole('button', { name: 'Discard' }), true)
    await user.click(within(prompt).getByRole('button', { name: 'Cancel' }))
    expect(onClose).not.toHaveBeenCalled()
    expect(textarea.value).toBe(MINE)

    release()
    await screen.findByRole('button', { name: 'Edit' })
    expect(host.count('dart.updateTaskDescription')).toBe(1)
  })

  it('Mark resolved and Discard this change wait for the save to settle', async () => {
    const user = userEvent.setup()
    const { host, task } = await openWith(BASE)
    await editToDraft(
      user,
      BASE.replace('stays as it is', 'stays changed').replace('gets the edit', 'got my edit')
    )
    setDescription(host, task.id, BASE.replace('gets the edit', 'was remote'))
    await user.click(saveButton())
    await user.click(
      within(await findConflictDialog()).getByRole('button', { name: 'Back to editing' })
    )
    await findEditorTextarea()
    const hunkButtons = (): HTMLElement[] => [
      ...screen.getAllByRole('button', { name: 'Mark resolved' }),
      ...screen.getAllByRole('button', { name: 'Discard this change' })
    ]
    const release = host.hold('dart.updateTaskDescription')

    await user.click(saveButton())
    await waitFor(() => expect(host.count('dart.updateTaskDescription')).toBe(1))
    expect(hunkButtons().length).toBeGreaterThan(1)
    hunkButtons().forEach((hunk) => expectDisabled(hunk, true))

    release()
    await waitFor(() => expect(saveButton().getAttribute('aria-busy')).toBe('false'))
    hunkButtons().forEach((hunk) => expectDisabled(hunk, false))
    expectDisabled(button('Cancel'), false)
  })

  it('shows Saving… only after 200 ms, in the same grid cell as Save', async () => {
    const user = userEvent.setup()
    const { host } = await openWith(BASE)
    await editToDraft(user, MINE)
    const release = host.hold('dart.updateTaskDescription')
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    fireEvent.click(saveButton())
    await act(() => vi.advanceTimersByTimeAsync(199))
    const save = saveButton()
    expectDisabled(save, true)
    expect(save.getAttribute('aria-busy')).toBe('true')
    // Both labels are always laid out, so the swap cannot move the layout.
    expect(save.textContent).toBe('SaveSaving…')
    expect(within(save).getByText('Saving…').className).toContain('invisible')
    expect(within(save).getByText('Save').className).not.toContain('invisible')

    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(within(save).getByText('Saving…').className).not.toContain('invisible')
    expect(within(save).getByText('Save').className).toContain('invisible')

    vi.useRealTimers()
    release()
    await screen.findByRole('button', { name: 'Edit' })
  })
})

describe('an unknown outcome across a task switch or reopen', () => {
  it('still offers "Dart now shows your text", and Dismiss ends the edit', async () => {
    const user = userEvent.setup()
    const { host, task, showTask, addTask } = await openWith(BASE)
    applyPatchesLikeDart(host)
    await editToDraft(user, MINE)
    host.lostReplies.push(LOST)
    await user.click(saveButton())
    const showsYourText = (): Promise<void> =>
      waitFor(() =>
        expect(screen.getByRole('status').textContent).toContain('Dart now shows your text')
      )
    await showsYourText()

    showTask(addTask('other'))
    await screen.findByRole('button', { name: 'Edit' })
    showTask(task)
    await showsYourText()

    showTask(null)
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())
    showTask(task)
    await showsYourText()

    await user.click(within(screen.getByRole('status')).getByRole('button', { name: 'Dismiss' }))
    await screen.findByRole('button', { name: 'Edit' })
    expect(oldestDirtyDraft()).toBeNull()
    expect(host.count('dart.updateTaskDescription')).toBe(1)
  })

  it('keeps it when the outcome arrives while another task is open', async () => {
    const user = userEvent.setup()
    const { host, task, showTask, addTask } = await openWith(BASE)
    applyPatchesLikeDart(host)
    await editToDraft(user, MINE)
    host.lostReplies.push(LOST)
    const release = host.hold('dart.updateTaskDescription')
    await user.click(saveButton())
    await waitFor(() => expect(host.count('dart.updateTaskDescription')).toBe(1))

    showTask(addTask('other'))
    await screen.findByRole('button', { name: 'Edit' })
    release()
    await waitFor(() => expect(oldestDirtyDraft()?.value).toHaveProperty('intended', MINE))
    showTask(task)

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('Dart now shows your text')
    )
    await user.click(within(screen.getByRole('status')).getByRole('button', { name: 'Dismiss' }))
    await screen.findByRole('button', { name: 'Edit' })
  })
})

describe('Back to editing', () => {
  it('leaves Preview for the textarea and focuses it', async () => {
    const user = userEvent.setup()
    const { host, task } = await openWith(BASE)
    await editToDraft(user, MINE)
    await user.click(button('Preview'))
    expect(button('Preview').getAttribute('aria-pressed')).toBe('true')
    setDescription(host, task.id, `Remote top.\n\n${BASE}`)
    await user.click(saveButton())

    await user.click(
      within(await findConflictDialog()).getByRole('button', { name: 'Back to editing' })
    )

    const textarea = await findEditorTextarea()
    await waitFor(() => expect(document.activeElement).toBe(textarea))
    expect(textarea.className).not.toContain('hidden')
    expect(button('Preview').getAttribute('aria-pressed')).toBe('false')
  })
})

describe('a stored draft on a host without writes v2', () => {
  it('is not an editor, so Esc in the read-only section does not ask to discard it', async () => {
    const task = {
      id: 'tOldHostTask1',
      title: 'Task',
      htmlUrl: 'https://app.dartai.com/t/tOldHostTask1',
      status: 'To-do',
      priority: 'Medium',
      tags: []
    }
    const draftKey = dartDraftKey({ hostKey: 'old-host', accountKey: 'a' }, task.id, 'description')
    setDraft(draftKey, { base: BASE, draft: MINE, unresolved: [] }, { dirty: true })
    render(
      <TooltipProvider>
        <DartTaskDetailDescription
          task={task}
          openUrl={task.htmlUrl}
          supportsWritesV2={false}
          description={{ status: 'ready', value: BASE }}
          readLatestTask={() => Promise.reject(new Error('not used'))}
          onSavePatch={() => Promise.reject(new Error('not used'))}
          registerCloseGuard={() => () => {}}
          pendingFields={new Set()}
          blockedFields={new Set()}
          notice={{ notice: null, dismissNotice: () => {}, recheckNotice: () => Promise.resolve() }}
          draftKey={draftKey}
          onRetry={() => {}}
        />
      </TooltipProvider>
    )

    fireEvent.keyDown(button('Copy'), { key: 'Escape' })
    await act(async () => {})

    expect(screen.queryByRole('dialog', { name: DISCARD_PROMPT })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})
