// @vitest-environment happy-dom

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DartComment } from '../../../../../shared/dart/dart-types'
import { getScreenSubmitShortcutLabel } from '@/lib/screen-submit-shortcut'
import { getShortcutPlatform } from '@/lib/shortcut-platform'
import type { FakeDartHost } from '@/store/slices/dart/dart-fake-runtime.test-support'
import { clearDraft, dartDraftKey, getDraft, setDraft } from './dart-draft-store'
import {
  openRenderedDartDetail,
  setUpRenderedDartDetail,
  tearDownRenderedDartDetail
} from './dart-task-detail.test-support'

// Fixed clock: relative times and "Last checked" never depend on when the suite runs.
const NOW = Date.parse('2026-11-04T12:00:00Z')

/** A write that landed on the host but whose reply was lost: the client cannot know. */
const UNKNOWN_ADD = {
  ok: false,
  error: 'Failed to add comment',
  errorCode: 'dart.commentFailed',
  outcome: 'unknown'
} as const

/** A write the host refused, which proves nothing was posted. */
const REFUSED_ADD = {
  ok: false,
  error: 'Failed to add comment',
  errorCode: 'dart.commentFailed',
  outcome: 'notApplied'
} as const

/** The id the fake host gives each comment it applies (`FakeDartHost.applyWrite`). */
const ADDED_COMMENT_ID = 'cMnOpQrStUvW'

function commentFixture(id: string, text: string, extra: Partial<DartComment> = {}): DartComment {
  return {
    id,
    taskId: 'task',
    htmlUrl: `https://app.dartai.com/c/${id}`,
    author: 'Alex Example',
    text,
    createdAt: new Date(NOW - 60_000).toISOString(),
    ...extra
  }
}

function addCommentRequests(host: FakeDartHost): Record<string, unknown>[] {
  return (
    host.requests
      .filter((request) => request.method === 'dart.addComment')
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: fake host params are record-shaped request payloads.
      .map((request) => request.params as Record<string, unknown>)
  )
}

/** Text inside comment articles only: the composer's retained draft is not a second comment. */
function commentTexts(text: string): Element[] {
  return [...document.querySelectorAll('article')].flatMap((article) =>
    within(article).queryAllByText(text)
  )
}

async function openComments(): Promise<HTMLTextAreaElement> {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: queried role is the known comment textarea.
  return (await screen.findByRole('textbox', { name: 'Comment' })) as HTMLTextAreaElement
}

function sendButton(): HTMLButtonElement {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: queried accessible name is the known send button.
  return screen.getByRole('button', { name: 'Send comment' }) as HTMLButtonElement
}

function typeComment(textarea: HTMLTextAreaElement, value: string): void {
  fireEvent.change(textarea, { target: { value } })
}

/** The text the composer shows right now, without awaiting anything. */
function currentCommentText(): string {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: queried role is the known comment textarea.
  return (screen.getByRole('textbox', { name: 'Comment' }) as HTMLTextAreaElement).value
}

/** The screen-submit chord for whichever platform this renderer reports. */
function pressSubmitShortcut(textarea: HTMLElement): void {
  fireEvent.keyDown(
    textarea,
    getShortcutPlatform() === 'darwin'
      ? { key: 'Enter', keyCode: 13, metaKey: true }
      : { key: 'Enter', keyCode: 13, ctrlKey: true }
  )
}

/** Lets promise chains started so far (write, reload, stale read) run to completion. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
  setUpRenderedDartDetail()
})

afterEach(() => {
  tearDownRenderedDartDetail()
  vi.useRealTimers()
})

describe('DartTaskDetailComments add', () => {
  it('sends one trimmed comment for the opened task and shows it once', async () => {
    const page = openRenderedDartDetail({ comments: [commentFixture('cRoot', 'First comment')] })
    const textarea = await openComments()
    await screen.findByText('First comment')

    typeComment(textarea, '  Hello Dart  ')
    fireEvent.click(sendButton())

    await waitFor(() => expect(page.host.count('dart.addComment')).toBe(1))
    const [request] = addCommentRequests(page.host)
    expect(request).toEqual(expect.objectContaining({ taskId: page.task.id, text: 'Hello Dart' }))
    expect('parentId' in request).toBe(false)

    await waitFor(() => expect(screen.getAllByText('Hello Dart')).toHaveLength(1))
    expect(textarea.value).toBe('')
  })

  it('sends a reply under the comment it replies to', async () => {
    const page = openRenderedDartDetail({ comments: [commentFixture('cRoot', 'Parent note')] })
    const textarea = await openComments()
    const article = (await screen.findByText('Parent note')).closest('article')
    expect(article).not.toBeNull()

    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: article contains the known Reply button.
    fireEvent.click(within(article as HTMLElement).getByRole('button', { name: 'Reply' }))
    expect(screen.getByText('Replying to Alex Example')).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(textarea))

    typeComment(textarea, 'A reply')
    fireEvent.click(sendButton())

    await waitFor(() => expect(page.host.count('dart.addComment')).toBe(1))
    expect(addCommentRequests(page.host)[0]).toEqual(
      expect.objectContaining({ text: 'A reply', parentId: 'cRoot' })
    )
    await waitFor(() => expect(screen.queryByText('Replying to Alex Example')).toBeNull())
  })

  it('ignores an empty comment and refuses one over the character limit', async () => {
    const page = openRenderedDartDetail()
    const textarea = await openComments()

    typeComment(textarea, '   ')
    expect(sendButton().hasAttribute('disabled')).toBe(true)
    pressSubmitShortcut(textarea)
    expect(page.host.count('dart.addComment')).toBe(0)
    expect(screen.queryByRole('alert')).toBeNull()

    typeComment(textarea, 'a'.repeat(50_001))
    expect(sendButton().hasAttribute('disabled')).toBe(false)
    pressSubmitShortcut(textarea)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/50[ ,]?001/)
    expect(alert.textContent).toMatch(/limit 50[ ,]?000/)
    expect(page.host.count('dart.addComment')).toBe(0)
  })

  it('keeps the draft and names the refusal when Dart does not apply the comment', async () => {
    const page = openRenderedDartDetail()
    const textarea = await openComments()
    page.host.refusals.push({
      ok: false,
      error: 'Failed to add comment',
      errorCode: 'dart.commentFailed',
      outcome: 'notApplied'
    })

    typeComment(textarea, 'Kept draft')
    fireEvent.click(sendButton())

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain("Comment wasn't saved:")
    expect(alert.textContent).toContain('Failed to add Dart comment.')
    expect(textarea.value).toBe('Kept draft')
    expect(sendButton().hasAttribute('disabled')).toBe(false)
  })
})

describe('DartTaskDetailComments unknown outcome', () => {
  it('reloads, notices the unknown write and never resends without Send again', async () => {
    const page = openRenderedDartDetail({ comments: [commentFixture('cRoot', 'Existing')] })
    const textarea = await openComments()
    await screen.findByText('Existing')
    const readsBefore = page.host.count('dart.listComments')
    page.host.lostReplies.push({
      ok: false,
      error: 'Failed to add comment',
      errorCode: 'dart.commentFailed',
      outcome: 'unknown'
    })

    typeComment(textarea, 'Possibly posted')
    fireEvent.click(sendButton())

    const status = await screen.findByRole('status')
    expect(status.textContent).toContain('Dart may have posted this comment')
    expect(page.host.count('dart.listComments')).toBeGreaterThan(readsBefore)
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Last checked'))

    // No blind resend, and the primary Send stays blocked until the user acts.
    expect(page.host.count('dart.addComment')).toBe(1)
    expect(sendButton().hasAttribute('disabled')).toBe(true)
    fireEvent.click(sendButton())
    expect(page.host.count('dart.addComment')).toBe(1)
    expect(textarea.value).toBe('Possibly posted')

    // Only the explicit Send again resends, and a success clears the notice.
    fireEvent.click(await screen.findByRole('button', { name: 'Send again' }))
    await waitFor(() => expect(page.host.count('dart.addComment')).toBe(2))
    expect(addCommentRequests(page.host)[1]).toEqual(
      expect.objectContaining({ text: 'Possibly posted' })
    )
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    expect(textarea.value).toBe('')
  })

  it('unblocks the primary Send when the user edits the text again', async () => {
    const page = openRenderedDartDetail()
    const textarea = await openComments()
    page.host.lostReplies.push({
      ok: false,
      error: 'Failed to add comment',
      errorCode: 'dart.commentFailed',
      outcome: 'unknown'
    })

    typeComment(textarea, 'Maybe landed')
    fireEvent.click(sendButton())
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Last checked'))
    expect(sendButton().hasAttribute('disabled')).toBe(true)

    typeComment(textarea, 'Maybe landed, edited')
    expect(sendButton().hasAttribute('disabled')).toBe(false)
    expect(page.host.count('dart.addComment')).toBe(1)
  })
})

describe('DartTaskDetailComments threads and stale reads', () => {
  it('renders nested replies depth first and keeps an orphan reply at the top level', async () => {
    openRenderedDartDetail({
      comments: [
        commentFixture('root1', 'Root one', {
          createdAt: new Date(NOW - 600_000).toISOString()
        }),
        commentFixture('root2', 'Root two', {
          createdAt: new Date(NOW - 300_000).toISOString()
        }),
        commentFixture('reply1', 'Reply one', {
          parentId: 'root1',
          createdAt: new Date(NOW - 500_000).toISOString()
        }),
        commentFixture('deep1', 'Deep reply', {
          parentId: 'reply1',
          createdAt: new Date(NOW - 400_000).toISOString()
        }),
        commentFixture('orphan', 'Orphan reply', {
          parentId: 'missing-parent',
          createdAt: new Date(NOW - 200_000).toISOString()
        })
      ]
    })
    await screen.findByText('Root one')

    const rows = [...document.querySelectorAll('article')].map((article) => ({
      depth: article.getAttribute('data-depth'),
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: article style is inspected after querying comment articles.
      indent: (article as HTMLElement).style.paddingLeft,
      text: article.textContent ?? ''
    }))
    expect(rows.map((row) => row.depth)).toEqual(['0', '1', '2', '0', '0'])
    expect(rows[0].text).toContain('Root one')
    expect(rows[1].text).toContain('Reply one')
    expect(rows[2].text).toContain('Deep reply')
    expect(rows[3].text).toContain('Root two')
    expect(rows[4].text).toContain('Orphan reply')
    expect(rows[1].indent).toBe('16px')
    expect(rows[2].indent).toBe('32px')
    expect(screen.getByText('Comments · 5')).toBeTruthy()
  })

  it('keeps a just-added comment when the reload reads a list without it', async () => {
    // The harness list read answers from the comments the detail opened with, so the reload after
    // a successful add is a read that does not list it: the added comment must survive it.
    const page = openRenderedDartDetail({ comments: [commentFixture('cRoot', 'First comment')] })
    const textarea = await openComments()
    await screen.findByText('First comment')
    const readsBefore = page.host.count('dart.listComments')

    typeComment(textarea, 'Fresh note')
    fireEvent.click(sendButton())

    await waitFor(() => expect(page.host.count('dart.listComments')).toBeGreaterThan(readsBefore))
    expect(screen.getAllByText('Fresh note')).toHaveLength(1)
    expect(screen.getByText('First comment')).toBeTruthy()
    expect(screen.getByText('Comments · 2')).toBeTruthy()
    expect(page.host.count('dart.addComment')).toBe(1)
  })
})

describe('DartTaskDetailComments keyboard and pending state', () => {
  it('runs one request for two quick submits', async () => {
    const page = openRenderedDartDetail()
    const textarea = await openComments()
    const releaseWrite = page.host.hold('dart.addComment')

    typeComment(textarea, 'Once only')
    pressSubmitShortcut(textarea)
    pressSubmitShortcut(textarea)

    await waitFor(() => expect(page.host.count('dart.addComment')).toBe(1))
    releaseWrite()
    await waitFor(() => expect(screen.getAllByText('Once only')).toHaveLength(1))
    expect(page.host.count('dart.addComment')).toBe(1)
  })

  it('submits on the screen shortcut and advertises it', async () => {
    const page = openRenderedDartDetail()
    const textarea = await openComments()
    expect(screen.getByText(`${getScreenSubmitShortcutLabel()} to send`)).toBeTruthy()

    typeComment(textarea, 'Shortcut note')
    pressSubmitShortcut(textarea)

    await waitFor(() => expect(page.host.count('dart.addComment')).toBe(1))
    await waitFor(() => expect(screen.getAllByText('Shortcut note')).toHaveLength(1))
  })

  it('leaves Enter to the input method while composing, then sends on the chord', async () => {
    const page = openRenderedDartDetail()
    const textarea = await openComments()

    typeComment(textarea, 'nihon')
    fireEvent.keyDown(textarea, { key: 'Enter', keyCode: 13, isComposing: true })
    fireEvent.keyDown(textarea, { key: 'Enter', keyCode: 229 })

    expect(page.host.count('dart.addComment')).toBe(0)
    expect(textarea.value).toBe('nihon')

    pressSubmitShortcut(textarea)
    await waitFor(() => expect(page.host.count('dart.addComment')).toBe(1))
  })

  it('cancels a reply with Escape without closing the detail and refocuses the composer', async () => {
    const page = openRenderedDartDetail({ comments: [commentFixture('cRoot', 'Parent note')] })
    const textarea = await openComments()
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: known comment text is rendered in an article.
    const article = (await screen.findByText('Parent note')).closest('article') as HTMLElement

    fireEvent.click(within(article).getByRole('button', { name: 'Reply' }))
    await waitFor(() => expect(document.activeElement).toBe(textarea))
    expect(screen.getByText('Replying to Alex Example')).toBeTruthy()

    textarea.blur()
    expect(document.activeElement).not.toBe(textarea)
    fireEvent.keyDown(textarea, { key: 'Escape' })

    expect(screen.queryByText('Replying to Alex Example')).toBeNull()
    expect(page.onClose).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(textarea)
    expect(page.host.count('dart.addComment')).toBe(0)
  })

  it('keeps Send busy and the same size while a 200ms write is pending, then settles', async () => {
    const page = openRenderedDartDetail()
    const textarea = await openComments()
    const send = sendButton()
    const sizeClasses = send.className
    expect(sizeClasses).toContain('size-8')
    expect(sizeClasses).toContain('flex-none')
    expect(textarea.closest('[aria-busy]')).toBeNull()

    const releaseWrite = page.host.hold('dart.addComment')
    // Virtual time only: the 200ms hold is advanced, never waited out.
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: NOW })
    try {
      typeComment(textarea, 'Slow note')
      fireEvent.click(send)

      // Still in flight: the composer is busy, Send cannot fire again, and the button keeps its box.
      expect(textarea.closest('[aria-busy]')?.getAttribute('aria-busy')).toBe('true')
      expect(send.hasAttribute('disabled')).toBe(true)
      expect(send.className).toBe(sizeClasses)
      expect(send.querySelector('svg')?.getAttribute('class')).toContain('animate-spin')

      setTimeout(releaseWrite, 200)
      await act(async () => {
        vi.advanceTimersByTime(199)
      })
      expect(textarea.closest('[aria-busy]')?.getAttribute('aria-busy')).toBe('true')
      expect(send.className).toBe(sizeClasses)
      expect(page.host.count('dart.addComment')).toBe(1)

      await act(async () => {
        vi.advanceTimersByTime(1)
      })
    } finally {
      vi.useRealTimers()
    }

    await waitFor(() => expect(screen.getAllByText('Slow note')).toHaveLength(1))
    expect(textarea.closest('[aria-busy]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Send comment' })).toBe(send)
    expect(send.className).toBe(sizeClasses)
    expect(page.host.count('dart.addComment')).toBe(1)
  })
})

// Reviewer round 2 (T5): an unknown outcome must outlive the component that showed it, so closing the
// sheet or switching tasks can never hand the user a Send that posts the same text twice.
describe('DartTaskDetailComments unknown outcome persistence', () => {
  it('shows the maybe-posted comment exactly once and never resends it by itself', async () => {
    const list = [commentFixture('cRoot', 'Existing')]
    const page = openRenderedDartDetail({ comments: list })
    const textarea = await openComments()
    await screen.findByText('Existing')
    // The lost write did land: the next list read reports it, as Dart would.
    const handle = page.host.handle.bind(page.host)
    let posted = 0
    page.host.handle = async (method, params) => {
      const reply = await handle(method, params)
      if (method === 'dart.addComment' && posted === 0) {
        posted += 1
        list.push(commentFixture(ADDED_COMMENT_ID, 'Possibly posted'))
      }
      return reply
    }
    page.host.lostReplies.push(UNKNOWN_ADD)

    typeComment(textarea, 'Possibly posted')
    fireEvent.click(sendButton())

    const status = await screen.findByRole('status')
    expect(status.textContent).toContain('may have posted')
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('Last checked')
    )
    // The composer keeps the draft text; the list must show the comment once.
    expect(commentTexts('Possibly posted')).toHaveLength(1)
    expect(screen.getByText('Existing')).toBeTruthy()
    expect(page.host.count('dart.addComment')).toBe(1)
    expect(sendButton().disabled).toBe(true)

    // Rechecking and the shortcut both leave the maybe-posted comment alone.
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    await settle()
    pressSubmitShortcut(textarea)
    await settle()
    expect(commentTexts('Possibly posted')).toHaveLength(1)
    expect(page.host.count('dart.addComment')).toBe(1)
  })

  it('restores the blocked draft and its notice after the sheet closes and reopens', async () => {
    const page = openRenderedDartDetail()
    const textarea = await openComments()
    page.host.lostReplies.push(UNKNOWN_ADD)

    typeComment(textarea, 'Maybe landed')
    fireEvent.click(sendButton())
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Last checked'))

    // Closing unmounts the composer: the block has to live with the draft, not the component.
    page.showTask(null)
    await settle()
    page.showTask(page.task)

    const reopened = await openComments()
    expect(reopened.value).toBe('Maybe landed')
    expect(screen.getByRole('status').textContent).toContain('may have posted')
    expect(screen.getByRole('status').textContent).toContain('Last checked')
    expect(sendButton().disabled).toBe(true)
    fireEvent.click(sendButton())
    pressSubmitShortcut(reopened)
    await settle()
    expect(page.host.count('dart.addComment')).toBe(1)
  })

  it('keeps the unknown draft on its own task across a switch', async () => {
    const page = openRenderedDartDetail({ comments: [] })
    const other = page.addTask('B')
    const textarea = await openComments()
    page.host.lostReplies.push(UNKNOWN_ADD)

    typeComment(textarea, 'Written on A')
    fireEvent.click(sendButton())
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Last checked'))

    page.showTask(other)
    const otherBox = await openComments()
    expect(otherBox.value).toBe('')
    expect(screen.queryByRole('status')).toBeNull()
    expect(otherBox.closest('[aria-busy]')).toBeNull()

    page.showTask(page.task)
    const backBox = await openComments()
    expect(backBox.value).toBe('Written on A')
    expect(screen.getByRole('status').textContent).toContain('may have posted')
    expect(sendButton().disabled).toBe(true)
    fireEvent.click(sendButton())
    await settle()
    expect(page.host.count('dart.addComment')).toBe(1)
  })

  it('keeps a send in flight across a task switch without posting it again', async () => {
    const page = openRenderedDartDetail({ comments: [] })
    const other = page.addTask('B')
    const textarea = await openComments()
    const release = page.host.hold('dart.addComment')

    typeComment(textarea, 'In flight body')
    fireEvent.click(sendButton())
    await settle()

    page.showTask(other)
    const otherBox = await openComments()
    expect(otherBox.closest('[aria-busy]')).toBeNull()

    page.showTask(page.task)
    const backBox = await openComments()
    expect(backBox.value).toBe('In flight body')
    expect(sendButton().disabled).toBe(true)
    fireEvent.click(sendButton())
    pressSubmitShortcut(backBox)
    await settle()
    expect(page.host.count('dart.addComment')).toBe(1)

    await act(async () => {
      release()
    })
    // The sent text must not come back as a live draft: sending it again would duplicate the comment.
    await waitFor(() => expect(currentCommentText()).toBe(''))
    expect(page.host.count('dart.addComment')).toBe(1)
  })

  it('keeps Send blocked when the deliberate resend is refused, so nothing is posted a third time', async () => {
    const page = openRenderedDartDetail()
    const textarea = await openComments()
    page.host.lostReplies.push(UNKNOWN_ADD)

    typeComment(textarea, 'Body')
    fireEvent.click(sendButton())
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Last checked'))

    page.host.refusals.push(REFUSED_ADD)
    fireEvent.click(screen.getByRole('button', { name: 'Send again' }))
    await settle()
    expect(page.host.count('dart.addComment')).toBe(2)
    // A refusal of the second attempt says nothing about the first: the draft stays blocked.
    expect((await openComments()).value).toBe('Body')
    expect(sendButton().disabled).toBe(true)
    fireEvent.click(sendButton())
    pressSubmitShortcut(textarea)
    await settle()
    expect(page.host.count('dart.addComment')).toBe(2)
  })
})

describe('DartTaskDetailComments stale read ordering', () => {
  it('drops a list read that was already in flight before the add', async () => {
    const page = openRenderedDartDetail({ comments: [commentFixture('cRoot', 'Existing')] })
    const textarea = await openComments()
    await screen.findByText('Existing')
    page.host.lostReplies.push(UNKNOWN_ADD)
    typeComment(textarea, 'First try')
    fireEvent.click(sendButton())
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Last checked'))

    // A read started now answers the pre-add list, whenever its reply lands.
    const gate = Promise.withResolvers<void>()
    const handle = page.host.handle.bind(page.host)
    let held = false
    page.host.handle = async (method, params) => {
      const reply = await handle(method, params)
      if (method === 'dart.listComments' && !held) {
        held = true
        await gate.promise
      }
      return reply
    }
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    await waitFor(() => expect(held).toBe(true))

    typeComment(textarea, 'Second note')
    fireEvent.click(sendButton())
    await waitFor(() => expect(page.host.count('dart.addComment')).toBe(2))

    // The pre-add list answers now: it must not remove the newer comment's local copy.
    await act(async () => {
      gate.resolve()
    })
    await settle()
    expect(screen.getAllByText('Second note')).toHaveLength(1)
    expect(screen.getByText('Existing')).toBeTruthy()
    expect(page.host.count('dart.addComment')).toBe(2)
  })
})

describe('DartTaskDetailComments submit paths', () => {
  it('posts once when the shortcut and the click race the same draft', async () => {
    const page = openRenderedDartDetail()
    const textarea = await openComments()
    const release = page.host.hold('dart.addComment')

    typeComment(textarea, 'Race note')
    pressSubmitShortcut(textarea)
    fireEvent.click(sendButton())

    await waitFor(() => expect(page.host.count('dart.addComment')).toBe(1))
    release()
    await waitFor(() => expect(screen.getAllByText('Race note')).toHaveLength(1))
    expect(page.host.count('dart.addComment')).toBe(1)
  })
})

describe('DartTaskDetailComments dismiss and draft persistence', () => {
  it('keeps Send blocked after Dismiss until the text is edited', async () => {
    const page = openRenderedDartDetail()
    const textarea = await openComments()
    page.host.lostReplies.push(UNKNOWN_ADD)

    typeComment(textarea, 'Dismiss body')
    fireEvent.click(sendButton())
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Last checked'))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await settle()
    // The notice is gone; the reason Send stays disabled may replace it, but not its buttons.
    expect(screen.queryByRole('button', { name: 'Check again' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull()
    // Dismissing the notice is not permission to reuse a maybe-posted draft.
    expect(sendButton().disabled).toBe(true)
    fireEvent.click(sendButton())
    pressSubmitShortcut(textarea)
    await settle()
    expect(page.host.count('dart.addComment')).toBe(1)

    typeComment(textarea, 'Dismiss body, edited')
    expect(sendButton().disabled).toBe(false)
    fireEvent.click(sendButton())
    await settle()
    expect(page.host.count('dart.addComment')).toBe(2)
  })

  it('warns when drafts are full and keeps the draft once the oldest is discarded', async () => {
    const page = openRenderedDartDetail()
    const identity = { hostKey: `runtime:${page.pageEnv}`, accountKey: 'user-a' }
    const draftKey = dartDraftKey(identity, page.task.id, 'comment')
    const filled: string[] = []
    try {
      const textarea = await openComments()
      // Fill the shared store to its cap; drafts can outlive a test file's own cleanup.
      for (let index = 0; index < 40; index += 1) {
        const key = dartDraftKey(identity, `filler${index}`, 'comment')
        filled.push(key)
        if (setDraft(key, 'filler', { dirty: true }) === 'full') {
          break
        }
      }
      typeComment(textarea, 'Twenty first')

      const warning = await screen.findByRole('alert')
      expect(warning.textContent).toMatch(/draft/i)
      expect(within(warning).getByRole('button', { name: 'Copy' })).toBeTruthy()
      // Nothing was stored for this text yet, so closing now would lose it.
      expect(getDraft(draftKey)).toBeUndefined()

      // Discarding the named draft frees the slot, so this text becomes a real draft.
      fireEvent.click(within(warning).getByRole('button', { name: 'Discard it' }))
      await settle()
      expect(screen.queryByRole('alert')).toBeNull()
      expect(getDraft(draftKey)).toBe('Twenty first')

      page.showTask(null)
      await settle()
      page.showTask(page.task)
      expect((await openComments()).value).toBe('Twenty first')
    } finally {
      for (const key of [...filled, draftKey]) {
        clearDraft(key)
      }
    }
  })
})

describe('DartTaskDetailComments reply target persistence', () => {
  it('restores the reply target with the draft after the sheet closes and reopens', async () => {
    const page = openRenderedDartDetail({ comments: [commentFixture('cRoot', 'Parent note')] })
    const textarea = await openComments()
    const article = (await screen.findByText('Parent note')).closest('article')
    expect(article).not.toBeNull()
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the article holds the known Reply button.
    fireEvent.click(within(article as HTMLElement).getByRole('button', { name: 'Reply' }))
    typeComment(textarea, 'A reply draft')
    await settle()

    page.showTask(null)
    await settle()
    page.showTask(page.task)

    const reopened = await openComments()
    expect(reopened.value).toBe('A reply draft')
    expect(screen.getByText('Replying to Alex Example')).toBeTruthy()
    fireEvent.click(sendButton())
    await waitFor(() => expect(page.host.count('dart.addComment')).toBe(1))
    expect(addCommentRequests(page.host)[0]).toEqual(
      expect.objectContaining({ text: 'A reply draft', parentId: 'cRoot' })
    )
  })

  it('keeps the reply target on the task that owns it across a switch', async () => {
    const page = openRenderedDartDetail({ comments: [commentFixture('cRoot', 'Parent note')] })
    const other = page.addTask('B')
    const textarea = await openComments()
    const article = (await screen.findByText('Parent note')).closest('article')
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the article holds the known Reply button.
    fireEvent.click(within(article as HTMLElement).getByRole('button', { name: 'Reply' }))
    typeComment(textarea, 'Reply on A')
    await settle()

    page.showTask(other)
    await openComments()
    expect(screen.queryByText('Replying to Alex Example')).toBeNull()

    page.showTask(page.task)
    expect((await openComments()).value).toBe('Reply on A')
    expect(screen.getByText('Replying to Alex Example')).toBeTruthy()
    fireEvent.click(sendButton())
    await waitFor(() => expect(page.host.count('dart.addComment')).toBe(1))
    expect(addCommentRequests(page.host)[0]).toEqual(
      expect.objectContaining({ taskId: page.task.id, parentId: 'cRoot' })
    )
  })
})
