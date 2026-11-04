// @vitest-environment happy-dom

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DartComment } from '../../../../../shared/dart/dart-types'
import { getShortcutPlatform } from '@/lib/shortcut-platform'
import { clearDraft, dartDraftKey, oldestDirtyDraft, setDraft } from './dart-draft-store'
import type { DartDraftValue } from './dart-draft-store'
import {
  openRenderedDartDetail,
  setUpRenderedDartDetail,
  tearDownRenderedDartDetail
} from './dart-task-detail.test-support'

const NOW = Date.parse('2026-11-04T12:00:00Z')
const UNKNOWN_ADD = {
  ok: false,
  error: 'Failed to add comment',
  errorCode: 'dart.commentFailed',
  outcome: 'unknown'
} as const

function commentFixture(id: string, text: string): DartComment {
  return {
    id,
    taskId: 'task',
    htmlUrl: `https://app.dartai.com/c/${id}`,
    author: 'Alex Example',
    text,
    createdAt: new Date(NOW - 60_000).toISOString()
  }
}

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

function currentCommentText(): string {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: queried role is the known comment textarea.
  return (screen.getByRole('textbox', { name: 'Comment' }) as HTMLTextAreaElement).value
}

function pressSubmitShortcut(textarea: HTMLElement): void {
  fireEvent.keyDown(
    textarea,
    getShortcutPlatform() === 'darwin'
      ? { key: 'Enter', keyCode: 13, metaKey: true }
      : { key: 'Enter', keyCode: 13, ctrlKey: true }
  )
}

async function settle(): Promise<void> {
  await act(async () => {
    const { promise, resolve } = Promise.withResolvers<void>()
    setTimeout(resolve, 0)
    await promise
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

describe('DartTaskDetailComments reconciliation regressions', () => {
  it('does not confirm a failed reload, even after dismissing the notice', async () => {
    const page = openRenderedDartDetail()
    const textarea = await openComments()
    const handle = page.host.handle.bind(page.host)
    page.host.handle = async (method, params) => {
      if (method === 'dart.listComments') {
        page.host.requests.push({ method, params })
        return { ok: false, error: 'List failed', errorCode: 'dart.commentFailed' }
      }
      return handle(method, params)
    }
    page.host.lostReplies.push(UNKNOWN_ADD)
    typeComment(textarea, 'Unconfirmed')
    fireEvent.click(sendButton())
    await screen.findByRole('status')
    expect(screen.getByRole('status').textContent).not.toContain('Last checked')
    expect(screen.queryByRole('button', { name: 'Send again' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(sendButton().disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Send again' })).toBeNull()
    pressSubmitShortcut(textarea)
    await settle()
    expect(page.host.count('dart.addComment')).toBe(1)
  })

  it.each(['unknown', 'success'] as const)(
    'keeps a %s write on its task when it lands away',
    async (outcome) => {
      const page = openRenderedDartDetail()
      const other = page.addTask('B')
      const textarea = await openComments()
      const release = page.host.hold('dart.addComment')
      if (outcome === 'unknown') {
        page.host.lostReplies.push(UNKNOWN_ADD)
      }
      typeComment(textarea, 'Sent on A')
      fireEvent.click(sendButton())
      await waitFor(() => expect(page.host.count('dart.addComment')).toBe(1))
      page.showTask(other)
      const otherBox = await openComments()
      typeComment(otherBox, 'Draft on B')
      await act(async () => release())
      await settle()
      expect(currentCommentText()).toBe('Draft on B')
      expect(screen.queryByRole('status')).toBeNull()
      page.showTask(page.task)
      const back = await openComments()
      if (outcome === 'unknown') {
        expect(back.value).toBe('Sent on A')
        expect(sendButton().disabled).toBe(true)
        expect(screen.getByRole('status').textContent).toContain('may have posted')
      } else {
        expect(back.value).toBe('')
      }
      expect(page.host.count('dart.addComment')).toBe(1)
    }
  )

  it('does not apply an old task list after switching tasks', async () => {
    const page = openRenderedDartDetail()
    const other = page.addTask('B')
    const textarea = await openComments()
    const handle = page.host.handle.bind(page.host)
    const gate = Promise.withResolvers<void>()
    let held = false
    page.host.handle = async (method, params) => {
      if (method === 'dart.listComments') {
        page.host.requests.push({ method, params })
        if (!held) {
          held = true
          await gate.promise
          return { ok: true, comments: [commentFixture('old', 'Old task list')], totalCount: 1 }
        }
        return { ok: true, comments: [commentFixture('new', 'New task list')], totalCount: 1 }
      }
      return handle(method, params)
    }
    page.host.lostReplies.push(UNKNOWN_ADD)
    typeComment(textarea, 'Trigger reload')
    fireEvent.click(sendButton())
    await waitFor(() => expect(held).toBe(true))
    page.showTask(other)
    await screen.findByText('New task list')
    await act(async () => gate.resolve())
    expect(screen.getByText('New task list')).toBeTruthy()
    expect(screen.queryByText('Old task list')).toBeNull()
  })

  it('keeps a write pending through its reload and does not send twice', async () => {
    const page = openRenderedDartDetail()
    const textarea = await openComments()
    const handle = page.host.handle.bind(page.host)
    const gate = Promise.withResolvers<void>()
    let held = false
    page.host.handle = async (method, params) => {
      const result = await handle(method, params)
      if (method === 'dart.listComments' && !held) {
        held = true
        await gate.promise
      }
      return result
    }
    typeComment(textarea, 'Pending reload')
    fireEvent.click(sendButton())
    await waitFor(() => expect(held).toBe(true))
    expect(sendButton().disabled).toBe(true)
    pressSubmitShortcut(textarea)
    expect(page.host.count('dart.addComment')).toBe(1)
    await act(async () => gate.resolve())
    await waitFor(() => expect(currentCommentText()).toBe(''))
  })
})

describe('DartTaskDetailComments body and list boundaries', () => {
  it('keeps the unknown body blocked after whitespace edits and editing away then back', async () => {
    const page = openRenderedDartDetail()
    const textarea = await openComments()
    page.host.lostReplies.push(UNKNOWN_ADD)
    typeComment(textarea, 'Same body')
    fireEvent.click(sendButton())
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Last checked'))
    typeComment(textarea, '  Same body  ')
    expect(sendButton().disabled).toBe(true)
    typeComment(textarea, 'Different body')
    expect(sendButton().disabled).toBe(false)
    typeComment(textarea, 'Same body')
    expect(sendButton().disabled).toBe(true)
    pressSubmitShortcut(textarea)
    await settle()
    expect(page.host.count('dart.addComment')).toBe(1)
  })

  it('does not increase a truncated server total for a locally added comment', async () => {
    const page = openRenderedDartDetail({ comments: [commentFixture('existing', 'Existing')] })
    const textarea = await openComments()
    await screen.findByText('Existing')
    const handle = page.host.handle.bind(page.host)
    page.host.handle = async (method, params) => {
      if (method === 'dart.listComments') {
        page.host.requests.push({ method, params })
        return { ok: true, comments: [commentFixture('existing', 'Existing')], totalCount: 5 }
      }
      return handle(method, params)
    }
    typeComment(textarea, 'Local note')
    fireEvent.click(sendButton())
    await screen.findByText('Showing first 2 of 5 comments.')
    expect(screen.getByText('Comments · 5')).toBeTruthy()
    expect(commentTexts('Local note')).toHaveLength(1)
  })
})

it('copies the oldest description draft with every unresolved user hunk', async () => {
  const page = openRenderedDartDetail()
  const textarea = await openComments()
  const identity = { hostKey: `runtime:${page.pageEnv}`, accountKey: 'user-a' }
  const keys = [dartDraftKey(identity, 'description-owner', 'description')]
  const displaced: { key: string; value: DartDraftValue }[] = []
  let oldest = oldestDirtyDraft()
  while (oldest) {
    displaced.push(oldest)
    clearDraft(oldest.key)
    oldest = oldestDirtyDraft()
  }
  const writeClipboardText = vi.fn(async () => {})
  const originalUi = window.api.ui
  Object.assign(window.api, { ui: { writeClipboardText } })
  try {
    expect(
      setDraft(
        keys[0],
        {
          base: 'Base',
          draft: 'Draft description',
          unresolved: [
            { id: 'one', baseText: 'Old one', userText: 'User hunk one' },
            { id: 'two', baseText: 'Old two', userText: 'User hunk two' }
          ]
        },
        { dirty: true }
      )
    ).toBe('ok')
    for (let index = 0; index < 19; index += 1) {
      const key = dartDraftKey(identity, `copy-filler-${index}`, 'comment')
      keys.push(key)
      expect(setDraft(key, 'filler', { dirty: true })).toBe('ok')
    }
    typeComment(textarea, 'Unsaved comment')
    const warning = await screen.findByRole('alert')
    fireEvent.click(within(warning).getByRole('button', { name: 'Copy' }))
    expect(writeClipboardText).toHaveBeenCalledWith(
      'Draft description\n\nUser hunk one\n\nUser hunk two'
    )
  } finally {
    for (const key of keys) {
      clearDraft(key)
    }
    for (const draft of displaced) {
      setDraft(draft.key, draft.value, { dirty: true })
    }
    Object.assign(window.api, { ui: originalUi })
  }
})
