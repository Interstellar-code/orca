// @vitest-environment happy-dom

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { DartComment } from '../../../../../shared/dart/dart-types'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  openRenderedDartDetail,
  setUpRenderedDartDetail,
  tearDownRenderedDartDetail
} from './dart-task-detail.test-support'
import { clearDraft, dartDraftKey } from './dart-draft-store'
import { clearDartCommentSendState } from './dart-comment-send-state'
import { setDartReplyTarget } from './dart-reply-target-store'
import { DartTaskDetailComments } from './TaskDetailComments'

const NOW = Date.parse('2026-11-04T12:00:00Z')
let nextKey = 0
const draftKeys: string[] = []
const unknown = { ok: false, error: 'Lost reply', outcome: 'unknown' } as const
const makeComment = (text: string, parentId?: string, author = 'Alex Example'): DartComment => ({
  id: `${text}-${parentId ?? 'root'}`,
  taskId: 'task',
  htmlUrl: 'https://app.dartai.com/c/example',
  author,
  text,
  parentId,
  createdAt: new Date(NOW - 60_000).toISOString()
})

function setup(initial: DartComment[] = [], viewerName: string | null = 'Alex Example') {
  const draftKey = dartDraftKey(
    { hostKey: 'runtime:test', accountKey: 'user-a' },
    `task-${nextKey++}`,
    'comment'
  )
  draftKeys.push(draftKey)
  let comments = [...initial]
  let failRead = false
  let loseReply = false
  let gate: Promise<void> | null = null
  const read = vi.fn(async () => {
    if (failRead) {
      throw new Error('Read failed')
    }
    return [...comments]
  })
  const add = vi.fn(async ({ text, parentId }: { text: string; parentId?: string }) => {
    if (gate) {
      await gate
    }
    const comment = makeComment(text, parentId)
    comments.push(comment)
    return loseReply ? unknown : { ok: true as const, comment }
  })
  const reload = vi.fn(async () => {})
  const append = vi.fn()
  const props = () => ({
    comments: {
      status: 'ready' as const,
      value: { comments: [...comments], totalCount: comments.length }
    },
    onAddComment: add,
    reloadComments: reload,
    appendLocalComment: append,
    readLatestComments: read,
    viewerName,
    draftKey,
    onRetry: () => {}
  })
  const tree = () => (
    <TooltipProvider>
      <DartTaskDetailComments {...props()} />
    </TooltipProvider>
  )
  const view = render(tree())
  return {
    add,
    read,
    reload,
    append,
    fail: (value: boolean) => {
      failRead = value
    },
    unknown: () => {
      loseReply = true
    },
    hold: (promise: Promise<void>) => {
      gate = promise
    },
    rerender: () => view.rerender(tree()),
    unmount: () => view.unmount(),
    remount: () => render(tree())
  }
}

function type(text: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Comment' }), { target: { value: text } })
}
function send() {
  fireEvent.click(screen.getByRole('button', { name: 'Send comment' }))
}
async function blocked() {
  await screen.findByText('This comment is already posted')
  expect(screen.getByRole('button', { name: 'Post anyway' })).toBeTruthy()
}
function reply(text: string) {
  const article = screen.getByText(text).closest('article')
  if (!article) {
    throw new Error('Missing comment')
  }
  fireEvent.click(within(article).getByRole('button', { name: 'Reply' }))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
  setUpRenderedDartDetail()
})
afterEach(() => {
  tearDownRenderedDartDetail()
  for (const key of draftKeys.splice(0)) {
    clearDraft(key)
    clearDartCommentSendState(key)
    setDartReplyTarget(key, null)
  }
  vi.useRealTimers()
})

it('P7 keeps an unknown result after a failed check and never posts blindly', async () => {
  const page = setup()
  page.unknown()
  type('Body')
  send()
  await screen.findByText('Not sure it posted')
  page.fail(true)
  fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
  await screen.findByText('Could not check comments. Retry before sending.')
  expect(page.add).toHaveBeenCalledTimes(1)
  page.fail(false)
  send()
  await blocked()
  expect(page.add).toHaveBeenCalledTimes(1)
})

it('P1 checks the server after a lost reply and prevents a second post', async () => {
  const page = setup()
  page.unknown()
  type('Posted body')
  send()
  await screen.findByText('Not sure it posted')
  expect(page.add).toHaveBeenCalledTimes(1)
  send()
  await blocked()
  expect(page.add).toHaveBeenCalledTimes(1)
})

it('P2 checks again after closing and reopening the task', async () => {
  const page = setup()
  page.unknown()
  type('Reopen body')
  send()
  await screen.findByText('Not sure it posted')
  page.unmount()
  page.remount()
  type('Reopen body')
  send()
  await blocked()
  expect(page.add).toHaveBeenCalledTimes(1)
})

it('P3 checks an in-flight post after returning to the task', async () => {
  const page = setup()
  const gate = Promise.withResolvers<void>()
  page.hold(gate.promise)
  type('In flight body')
  send()
  await waitFor(() => expect(page.add).toHaveBeenCalledTimes(1))
  page.unmount()
  page.remount()
  expect(screen.getByRole('button', { name: 'Send comment' }).hasAttribute('disabled')).toBe(true)
  send()
  expect(page.add).toHaveBeenCalledTimes(1)
  await act(async () => gate.resolve())
  type('In flight body')
  send()
  await blocked()
  expect(page.add).toHaveBeenCalledTimes(1)
})

it('P4 does not mistake another parent for a duplicate but blocks the original reply', async () => {
  const page = setup([
    makeComment('Parent P', undefined, 'Pat'),
    makeComment('Parent Q', undefined, 'Quinn'),
    makeComment('Reply body', 'Parent P-root')
  ])
  reply('Parent P')
  type('Reply body')
  send()
  await blocked()
  expect(page.add).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  reply('Parent Q')
  send()
  await waitFor(() => expect(page.add).toHaveBeenCalledTimes(1))
  expect(page.add).toHaveBeenCalledWith({ text: 'Reply body', parentId: 'Parent Q-root' })
})

it('H1 guards a post that lands after switching away while the displayed list lags', async () => {
  const page = openRenderedDartDetail()
  const other = page.addTask('B')
  await screen.findByText('No comments yet.')
  const handle = page.host.handle.bind(page.host)
  let landed = false
  page.host.handle = async (method, params) => {
    if (method === 'dart.listComments') {
      page.host.requests.push({ method, params })
      const comments = landed && params.taskId === page.task.id ? [makeComment('Late A')] : []
      return { ok: true, comments, totalCount: comments.length }
    }
    const result = await handle(method, params)
    if (method === 'dart.addComment') {
      landed = true
    }
    return result
  }
  const release = page.host.hold('dart.addComment')
  type('Late A')
  send()
  await waitFor(() => expect(page.host.count('dart.addComment')).toBe(1))
  page.showTask(other)
  await act(async () => release())
  page.showTask(page.task)
  await screen.findByRole('textbox', { name: 'Comment' })
  type('Late A')
  send()
  await blocked()
  expect(page.host.count('dart.addComment')).toBe(1)
})

it('H2 refuses a fresh read failure after an unknown post and remount', async () => {
  const page = setup()
  page.fail(true)
  type('Read failed first')
  send()
  await screen.findByText('Could not check comments. Retry before sending.')
  expect(page.add).not.toHaveBeenCalled()
  page.fail(false)
  page.unknown()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await screen.findByText('Not sure it posted')
  page.fail(true)
  page.unmount()
  page.remount()
  type('Read failed first')
  send()
  await screen.findByText('Could not check comments. Retry before sending.')
  expect(page.add).toHaveBeenCalledTimes(1)
})

it('H3 guards a lost reply under its original parent and permits a new root', async () => {
  const page = setup([makeComment('Parent P', undefined, 'Pat')])
  reply('Parent P')
  page.unknown()
  type('Reply body')
  send()
  await screen.findByText('Not sure it posted')
  expect(screen.queryByRole('button', { name: 'It posted' })).toBeNull()
  send()
  await blocked()
  expect(page.add).toHaveBeenCalledTimes(1)
  type('Edited reply')
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  type('Reply body')
  send()
  await waitFor(() => expect(page.add).toHaveBeenCalledTimes(2))
  expect(page.add).toHaveBeenLastCalledWith({ text: 'Reply body' })
})

it('requires an explicit Post anyway for an identical recent comment', async () => {
  const page = setup([makeComment('Already here')])
  type('Already here')
  send()
  await blocked()
  expect(page.add).not.toHaveBeenCalled()
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Comment' }), {
    key: 'Enter',
    ctrlKey: true
  })
  await waitFor(() => expect(page.add).not.toHaveBeenCalled())
  fireEvent.click(screen.getByRole('button', { name: 'Post anyway' }))
  await waitFor(() => expect(page.add).toHaveBeenCalledTimes(1))
  expect(page.append).toHaveBeenCalledTimes(1)
  expect(page.reload).toHaveBeenCalledTimes(1)
})

it('Check again finds a lost-reply comment and clears the draft without resending', async () => {
  const page = setup()
  page.unknown()
  type('Found after timeout')
  send()
  await screen.findByText('Not sure it posted')
  fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'Comment' })).toHaveProperty('value', '')
  )
  expect(page.add).toHaveBeenCalledTimes(1)
})

it('P4 keeps a late task A result off task B and still guards A after return', async () => {
  const page = openRenderedDartDetail()
  const other = page.addTask('B')
  await screen.findByText('No comments yet.')
  const gate = page.host.hold('dart.addComment')
  type('Written on A')
  send()
  await waitFor(() => expect(page.host.count('dart.addComment')).toBe(1))
  page.showTask(other)
  await act(async () => gate())
  expect(screen.queryByText('Written on A')).toBeNull()
  page.showTask(page.task)
  await screen.findByRole('textbox', { name: 'Comment' })
  const handle = page.host.handle.bind(page.host)
  page.host.handle = async (method, params) => {
    if (method === 'dart.listComments') {
      page.host.requests.push({ method, params })
      return { ok: true, comments: [makeComment('Written on A')], totalCount: 1 }
    }
    return handle(method, params)
  }
  type('Written on A')
  send()
  await blocked()
  expect(page.host.count('dart.addComment')).toBe(1)
})

it('matches only the viewer, parent, trimmed text and ten-minute window', async () => {
  const page = setup([
    { ...makeComment('Same', undefined, 'Another user'), createdAt: new Date(NOW).toISOString() },
    { ...makeComment('Same'), id: 'old', createdAt: new Date(NOW - 600_001).toISOString() },
    makeComment('Same', 'other-parent'),
    { ...makeComment('  Same  '), id: 'boundary', createdAt: new Date(NOW - 600_000).toISOString() }
  ])
  type('Same')
  send()
  await blocked()
  expect(page.add).not.toHaveBeenCalled()
})

it('allows other authors, other parents and comments older than ten minutes', async () => {
  const page = setup([
    makeComment('Same', undefined, 'Another user'),
    { ...makeComment('Same'), id: 'old', createdAt: new Date(NOW - 600_001).toISOString() },
    makeComment('Same', 'other-parent')
  ])
  type('Same')
  send()
  await waitFor(() => expect(page.add).toHaveBeenCalledTimes(1))
  expect(screen.queryByText('This comment is already posted')).toBeNull()
})

it('refuses to send when the current viewer is unknown', async () => {
  const page = setup([], null)
  type('Cannot check')
  send()
  await screen.findByText(
    'Cannot check for duplicate comments without the current Dart user. Retry after reconnecting.'
  )
  expect(page.add).not.toHaveBeenCalled()
})

it('refuses a failed pre-send read and retries the guard before posting', async () => {
  const page = setup([makeComment('Existing')])
  page.fail(true)
  type('Existing')
  send()
  await screen.findByText('Could not check comments. Retry before sending.')
  expect(page.add).not.toHaveBeenCalled()
  page.fail(false)
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await blocked()
  expect(page.add).not.toHaveBeenCalled()
})

it('does not post after the task closes during the pre-send read', async () => {
  const page = setup()
  const pending = Promise.withResolvers<DartComment[]>()
  page.read.mockImplementationOnce(() => pending.promise)
  type('Do not send after close')
  send()
  await waitFor(() => expect(page.read).toHaveBeenCalledOnce())
  page.unmount()
  await act(async () => pending.resolve([]))
  expect(page.add).not.toHaveBeenCalled()
})
