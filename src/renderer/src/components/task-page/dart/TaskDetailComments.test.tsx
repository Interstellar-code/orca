// @vitest-environment happy-dom

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DartComment } from '../../../../../shared/dart/dart-types'
import { getScreenSubmitShortcutLabel } from '@/lib/screen-submit-shortcut'
import { getShortcutPlatform } from '@/lib/shortcut-platform'
import type { FakeDartHost } from '@/store/slices/dart/dart-fake-runtime.test-support'
import { bumpDartEpochs } from '@/store/slices/dart/dart-task-identity'
import { clearDraft, dartDraftKey, getDraft, setDraft } from './dart-draft-store'
import {
  openRenderedDartDetail,
  setUpRenderedDartDetail,
  tearDownRenderedDartDetail
} from './dart-task-detail.test-support'

// Fixed clock: relative times and "Last checked" never depend on when the suite runs.
const NOW = Date.parse('2026-11-04T12:00:00Z')

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

it('checks later comment pages before posting', async () => {
  const page = openRenderedDartDetail()
  const textarea = await openComments()
  await screen.findByText('No comments yet.')
  const handle = page.host.handle.bind(page.host)
  const comments = Array.from({ length: 250 }, (_, index) =>
    commentFixture(`old-${index}`, `Old ${index}`, {
      createdAt: new Date(NOW - 700_000).toISOString()
    })
  )
  comments.push(commentFixture('duplicate', 'Already posted'))
  page.host.handle = async (method, params) => {
    if (method === 'dart.listComments') {
      page.host.requests.push({ method, params })
      const offset = 'offset' in params && typeof params.offset === 'number' ? params.offset : 0
      return {
        ok: true,
        comments: comments.slice(offset, offset + 250),
        totalCount: comments.length
      }
    }
    return handle(method, params)
  }
  typeComment(textarea, 'Already posted')
  fireEvent.click(sendButton())
  await screen.findByText('A matching comment is already posted')
  expect(page.host.count('dart.addComment')).toBe(0)
  expect(page.host.count('dart.listComments')).toBeGreaterThanOrEqual(3)
})

it('checks and posts through the detail host instead of the page host', async () => {
  const page = openRenderedDartDetail({ detailEnv: 'comments-remote' })
  const textarea = await openComments()
  await screen.findByText('No comments yet.')
  const otherHost = page.runtime.host(page.pageEnv)
  const detailReads = page.host.count('dart.listComments')
  const pageReads = otherHost.count('dart.listComments')
  typeComment(textarea, 'On the detail host')
  fireEvent.click(sendButton())
  await waitFor(() => expect(page.host.count('dart.addComment')).toBe(1))
  expect(page.host.count('dart.listComments')).toBeGreaterThan(detailReads)
  expect(otherHost.count('dart.listComments')).toBe(pageReads)
  expect(otherHost.count('dart.addComment')).toBe(0)
})

it('shows an error rather than a stuck skeleton when every initial comments read is stale', async () => {
  const page = openRenderedDartDetail()
  const other = page.addTask('stale')
  await screen.findByText('No comments yet.')
  const handle = page.host.handle.bind(page.host)
  page.host.handle = async (method, params) => {
    if (method === 'dart.listComments' && params.taskId === other.id) {
      page.host.requests.push({ method, params })
      bumpDartEpochs({
        hostKey: `runtime:${page.detailEnv}`,
        accountKey: 'user-a',
        taskId: other.id
      })
      return { ok: true, comments: [commentFixture('stale', 'Stale result')], totalCount: 1 }
    }
    return handle(method, params)
  }
  page.showTask(other)
  await screen.findByRole('alert')
  expect(screen.queryByText('Stale result')).toBeNull()
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
})

it.each(['pre-send', 'reload'])(
  'drops a late %s comments read after switching tasks',
  async (phase) => {
    const page = openRenderedDartDetail()
    const other = page.addTask('other')
    const textarea = await openComments()
    await screen.findByText('No comments yet.')
    const handle = page.host.handle.bind(page.host)
    const pending = Promise.withResolvers<object>()
    let held = false
    page.host.handle = async (method, params) => {
      if (
        method === 'dart.listComments' &&
        params.taskId === page.task.id &&
        !held &&
        (phase === 'pre-send' || page.host.count('dart.addComment') > 0)
      ) {
        held = true
        page.host.requests.push({ method, params })
        return pending.promise
      }
      return handle(method, params)
    }
    typeComment(textarea, 'Write on A')
    fireEvent.click(sendButton())
    await waitFor(() => expect(held).toBe(true))
    page.showTask(other)
    await screen.findByText('No comments yet.')
    await act(async () =>
      pending.resolve({
        ok: true,
        comments: [commentFixture('late', 'Wrong task comment')],
        totalCount: 1
      })
    )
    expect(screen.queryByText('Wrong task comment')).toBeNull()
    if (phase === 'pre-send') {
      expect(page.host.count('dart.addComment')).toBe(0)
    }
  }
)

it('drops a late comments read after switching to another task', async () => {
  const page = openRenderedDartDetail()
  const other = page.addTask('late')
  await screen.findByText('No comments yet.')
  const handle = page.host.handle.bind(page.host)
  const pending = Promise.withResolvers<object>()
  page.host.handle = async (method, params) => {
    if (method === 'dart.listComments' && params.taskId === other.id) {
      page.host.requests.push({ method, params })
      return pending.promise
    }
    return handle(method, params)
  }
  const before = page.host.count('dart.listComments')
  page.showTask(other)
  await waitFor(() => expect(page.host.count('dart.listComments')).toBeGreaterThan(before))
  page.showTask(page.task)
  await screen.findByText('No comments yet.')
  await act(async () =>
    pending.resolve({
      ok: true,
      comments: [commentFixture('late', 'Wrong task comment')],
      totalCount: 1
    })
  )
  expect(screen.queryByText('Wrong task comment')).toBeNull()
})

it('refuses an empty page while the server reports more comments', async () => {
  const page = openRenderedDartDetail()
  const textarea = await openComments()
  await screen.findByText('No comments yet.')
  const handle = page.host.handle.bind(page.host)
  page.host.handle = async (method, params) => {
    if (method === 'dart.listComments') {
      page.host.requests.push({ method, params })
      return { ok: true, comments: [], totalCount: 1 }
    }
    return handle(method, params)
  }
  typeComment(textarea, 'Do not post')
  fireEvent.click(sendButton())
  await screen.findByText('Could not check comments. Retry before sending.')
  expect(page.host.count('dart.addComment')).toBe(0)
  expect(textarea.value).toBe('Do not post')
})

it.each([0, 250])(
  'refuses a failed comments read at offset %i without publishing partial results',
  async (failedOffset) => {
    const page = openRenderedDartDetail()
    const textarea = await openComments()
    await screen.findByText('No comments yet.')
    const handle = page.host.handle.bind(page.host)
    page.host.handle = async (method, params) => {
      if (method === 'dart.listComments') {
        page.host.requests.push({ method, params })
        const offset = 'offset' in params && typeof params.offset === 'number' ? params.offset : 0
        if (offset === failedOffset) {
          return { ok: false, error: 'Read failed' }
        }
        return {
          ok: true,
          comments: Array.from({ length: 250 }, (_, index) =>
            commentFixture(`partial-${index}`, `Partial ${index}`)
          ),
          totalCount: 251
        }
      }
      return handle(method, params)
    }
    typeComment(textarea, 'Draft survives')
    fireEvent.click(sendButton())
    await screen.findByText('Could not check comments. Retry before sending.')
    expect(page.host.count('dart.addComment')).toBe(0)
    expect(textarea.value).toBe('Draft survives')
    expect(screen.queryByText('Partial 0')).toBeNull()
  }
)

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
    const modifier = getShortcutPlatform() === 'darwin' ? { metaKey: true } : { ctrlKey: true }
    fireEvent.keyDown(textarea, { key: 'Enter', keyCode: 13, isComposing: true, ...modifier })
    fireEvent.keyDown(textarea, { key: 'Enter', keyCode: 229, ...modifier })

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
    typeComment(textarea, 'Slow note')
    fireEvent.click(send)
    await waitFor(() => expect(page.host.count('dart.addComment')).toBe(1))
    // Virtual time only: the 200ms hold is advanced, never waited out.
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: NOW })
    try {
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
    await screen.findByText('Parent note')
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

it('retains another task’s reply target when a pending reply succeeds away', async () => {
  const page = openRenderedDartDetail({ comments: [commentFixture('parent', 'Parent')] })
  const other = page.addTask('B')
  const textarea = await openComments()
  const parent = (await screen.findByText('Parent')).closest('article')
  expect(parent).not.toBeNull()
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: Parent is rendered in a comment article.
  fireEvent.click(within(parent as HTMLElement).getByRole('button', { name: 'Reply' }))
  typeComment(textarea, 'Reply on A')
  const release = page.host.hold('dart.addComment')
  fireEvent.click(sendButton())
  await waitFor(() => expect(page.host.count('dart.addComment')).toBe(1))
  page.showTask(other)
  const otherBox = await openComments()
  const otherParent = (await screen.findByText('Parent')).closest('article')
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: Parent is rendered in a comment article.
  fireEvent.click(within(otherParent as HTMLElement).getByRole('button', { name: 'Reply' }))
  typeComment(otherBox, 'Reply on B')
  await act(async () => release())
  expect(screen.getByText('Replying to Alex Example')).toBeTruthy()
  expect(currentCommentText()).toBe('Reply on B')
  fireEvent.click(sendButton())
  await waitFor(() => expect(page.host.count('dart.addComment')).toBe(2))
  expect(addCommentRequests(page.host)[1]).toEqual(
    expect.objectContaining({ taskId: other.id, parentId: 'parent', text: 'Reply on B' })
  )
})
