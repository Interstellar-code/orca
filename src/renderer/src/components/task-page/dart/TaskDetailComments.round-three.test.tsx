// @vitest-environment happy-dom

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import type { DartComment } from '../../../../../shared/dart/dart-types'
import {
  openRenderedDartDetail,
  setUpRenderedDartDetail,
  tearDownRenderedDartDetail
} from './dart-task-detail.test-support'
import { clearDartCommentSendState, getDartCommentSendState } from './dart-comment-send-state'
import {
  clearDraft,
  dartDraftKey,
  oldestDirtyDraft,
  setDraft,
  type DartDraftValue
} from './dart-draft-store'

const UNKNOWN = {
  ok: false,
  error: 'Lost reply',
  errorCode: 'dart.commentFailed',
  outcome: 'unknown'
} as const
const comment = (id: string, text: string, author = 'Pat'): DartComment => ({
  id,
  text,
  author,
  taskId: 'task',
  htmlUrl: `https://app.dartai.com/c/${id}`
})
const box = (): HTMLTextAreaElement => {
  const element = screen.getByRole('textbox', { name: 'Comment' })
  if (!(element instanceof HTMLTextAreaElement)) {
    throw new Error('Missing comment textarea')
  }
  return element
}
const send = (): HTMLButtonElement => {
  const element = screen.getByRole('button', { name: 'Send comment' })
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error('Missing send button')
  }
  return element
}
const type = (value: string): void => {
  fireEvent.change(box(), { target: { value } })
}

beforeEach(() => {
  setUpRenderedDartDetail()
})
afterEach(() => {
  tearDownRenderedDartDetail()
})

it('records an unknown result after its draft was discarded mid-send', async () => {
  const page = openRenderedDartDetail()
  await screen.findByText('No comments yet.')
  const key = dartDraftKey(
    { hostKey: `runtime:${page.pageEnv}`, accountKey: 'user-a' },
    page.task.id,
    'comment'
  )
  page.host.lostReplies.push(UNKNOWN)
  const release = page.host.hold('dart.addComment')
  type('Discarded pending')
  fireEvent.click(send())
  await waitFor(() => expect(page.host.count('dart.addComment')).toBe(1))
  act(() => clearDartCommentSendState(key))
  await act(async () => release())
  expect(getDartCommentSendState(key).uncertainBodies.has('Discarded pending')).toBe(true)
  type('Discarded pending')
  expect(send().disabled).toBe(true)
})
it('locks reply and cancel while an edited unknown reply remains unresolved', async () => {
  const page = openRenderedDartDetail({
    comments: [comment('p', 'Parent P'), comment('q', 'Parent Q', 'Quinn')]
  })
  await screen.findByText('Parent P')
  const replies = screen.getAllByRole('button', { name: 'Reply' })
  fireEvent.click(replies[0])
  page.host.lostReplies.push(UNKNOWN)
  type('Body')
  fireEvent.click(send())
  await screen.findByRole('button', { name: 'Send again' })
  type('Edited')
  expect(replies[1].hasAttribute('disabled')).toBe(true)
  expect(screen.getByRole('button', { name: 'Cancel' }).hasAttribute('disabled')).toBe(true)
  type('Body')
  fireEvent.click(screen.getByRole('button', { name: 'Send again' }))
  await waitFor(() => expect(page.host.count('dart.addComment')).toBe(2))
  expect(
    page.host.requests.filter((request) => request.method === 'dart.addComment')[1].params
  ).toEqual(expect.objectContaining({ parentId: 'p' }))
})

it('resends each unknown body to its original parent after discard', async () => {
  const page = openRenderedDartDetail({ comments: [comment('p', 'Parent P')] })
  await screen.findByText('Parent P')
  fireEvent.click(screen.getByRole('button', { name: 'Reply' }))
  page.host.lostReplies.push(UNKNOWN)
  type('Reply body')
  fireEvent.click(send())
  await screen.findByRole('button', { name: 'Send again' })
  const key = dartDraftKey(
    { hostKey: `runtime:${page.pageEnv}`, accountKey: 'user-a' },
    page.task.id,
    'comment'
  )
  act(() => clearDartCommentSendState(key))
  type('Reply body')
  fireEvent.click(screen.getByRole('button', { name: 'Send again' }))
  await waitFor(() => expect(page.host.count('dart.addComment')).toBe(2))
  expect(
    page.host.requests.filter((request) => request.method === 'dart.addComment')[1].params
  ).toEqual(expect.objectContaining({ parentId: 'p' }))
})

it.each(['success', 'unknown'] as const)(
  'retains %s landing after the entire task view unmounts',
  async (outcome) => {
    const page = openRenderedDartDetail()
    await screen.findByText('No comments yet.')
    if (outcome === 'unknown') {
      page.host.lostReplies.push(UNKNOWN)
    }
    const release = page.host.hold('dart.addComment')
    type('Late outcome')
    fireEvent.click(send())
    await waitFor(() => expect(page.host.count('dart.addComment')).toBe(1))
    page.unmount()
    await act(async () => release())
    page.remount()
    if (outcome === 'success') {
      await screen.findByText('Late outcome')
    } else {
      expect((await screen.findByRole('status')).textContent).toContain('may have posted')
      expect(send().disabled).toBe(true)
    }
    expect(page.host.count('dart.addComment')).toBe(1)
  }
)
it.each(['close', 'switch'] as const)(
  'shows a success after returning from %s before it lands (R1/M6)',
  async (leave) => {
    const list = [comment('base', 'Existing')]
    const page = openRenderedDartDetail({ comments: list })
    const other = page.addTask('B')
    await screen.findByText('Existing')
    const handle = page.host.handle.bind(page.host)
    page.host.handle = async (method, params) => {
      const result = await handle(method, params)
      if (method === 'dart.addComment') {
        list.push(comment('cMnOpQrStUvW', 'Late success'))
      }
      return result
    }
    const release = page.host.hold('dart.addComment')
    type('Late success')
    fireEvent.click(send())
    await waitFor(() => expect(page.host.count('dart.addComment')).toBe(1))
    page.showTask(leave === 'close' ? null : other)
    await act(async () => {})
    page.showTask(page.task)
    await screen.findByText('Existing')
    expect(box().readOnly).toBe(true)
    await act(async () => release())
    await waitFor(() => expect(box().readOnly).toBe(false))
    expect(box().value).toBe('')
    expect(
      [...document.querySelectorAll('article')].filter((row) =>
        row.textContent?.includes('Late success')
      )
    ).toHaveLength(1)
    expect(page.host.count('dart.addComment')).toBe(1)
  }
)

it.each(['B', 'A'] as const)(
  'resolves the first read on %s when an older send triggers a reload (R2)',
  async (destination) => {
    const page = openRenderedDartDetail({ comments: [comment('base', 'Existing A')] })
    const other = page.addTask('B')
    await screen.findByText('Existing A')
    const release = page.host.hold('dart.addComment')
    type('Late send')
    fireEvent.click(send())
    await waitFor(() => expect(page.host.count('dart.addComment')).toBe(1))
    const gate = Promise.withResolvers<void>()
    const handle = page.host.handle.bind(page.host)
    let reads = 0
    page.host.handle = async (method, params) => {
      if (method === 'dart.listComments') {
        page.host.requests.push({ method, params })
        reads += 1
        await gate.promise
        return {
          ok: true,
          comments: [comment('destination', 'Destination comment')],
          totalCount: 1
        }
      }
      return handle(method, params)
    }
    if (destination === 'A') {
      page.showTask(null)
      await act(async () => {})
    }
    page.showTask(destination === 'A' ? page.task : other)
    await waitFor(() => expect(reads).toBe(1))
    await act(async () => release())
    await act(async () => gate.resolve())
    await screen.findByText('Destination comment')
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  }
)

it('blocks every unknown body after editing away and back (R3)', async () => {
  const page = openRenderedDartDetail()
  await screen.findByText('No comments yet.')
  for (const body of ['Body', 'Body2']) {
    page.host.lostReplies.push(UNKNOWN)
    type(body)
    fireEvent.click(send())
    await waitFor(() => expect(box().readOnly).toBe(false))
    await screen.findByRole('button', { name: 'Send again' })
  }
  for (const body of ['Body', ' Body2 ']) {
    type(body)
    expect(send().disabled).toBe(true)
    fireEvent.click(send())
  }
  expect(page.host.count('dart.addComment')).toBe(2)
})

it('blocks an original unknown body after discarding another task’s oldest draft (N7)', async () => {
  const page = openRenderedDartDetail()
  const other = page.addTask('B')
  const identity = { hostKey: `runtime:${page.pageEnv}`, accountKey: 'user-a' }
  const filled: string[] = []
  const original = 'Original unknown body'
  const displaced: { key: string; value: DartDraftValue }[] = []
  for (let oldest = oldestDirtyDraft(); oldest; oldest = oldestDirtyDraft()) {
    displaced.push(oldest)
    clearDraft(oldest.key)
  }

  try {
    page.host.lostReplies.push(UNKNOWN)
    type(original)
    fireEvent.click(send())
    await screen.findByRole('button', { name: 'Send again' })
    await screen.findByText('No comments yet.')
    for (let index = 0; index < 19; index += 1) {
      const key = dartDraftKey(identity, `${other.id}-filler-${index}`, 'comment')
      filled.push(key)
      expect(setDraft(key, `filler ${index}`, { dirty: true })).toBe('ok')
    }
    expect(page.host.count('dart.addComment')).toBe(1)

    page.showTask(other)
    type('Bounded draft')
    const warning = await screen.findByRole('alert')
    fireEvent.click(within(warning).getByRole('button', { name: 'Discard it' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())

    page.showTask(page.task)
    await screen.findByRole('button', { name: 'Send again' })
    type('Edited unknown body')
    type(original)
    expect(send().disabled).toBe(true)
    fireEvent.click(send())
    expect(page.host.count('dart.addComment')).toBe(1)
  } finally {
    const taskKey = dartDraftKey(identity, page.task.id, 'comment')
    const otherKey = dartDraftKey(identity, other.id, 'comment')
    for (const key of filled) {
      clearDraft(key)
    }
    clearDraft(taskKey)
    clearDraft(otherKey)
    clearDartCommentSendState(taskKey)
    clearDartCommentSendState(otherKey)
    for (const draft of displaced) {
      setDraft(draft.key, draft.value, { dirty: true })
    }
  }
})

it('keeps the reply banner and deliberate resend target aligned (R4)', async () => {
  const page = openRenderedDartDetail({
    comments: [comment('p', 'Parent P'), comment('q', 'Parent Q', 'Quinn')]
  })
  await screen.findByText('Parent P')
  const replies = screen.getAllByRole('button', { name: 'Reply' })
  fireEvent.click(replies[0])
  page.host.lostReplies.push(UNKNOWN)
  type('Reply body')
  fireEvent.click(send())
  await screen.findByRole('button', { name: 'Send again' })
  expect(replies[1].hasAttribute('disabled')).toBe(true)
  fireEvent.click(replies[1])
  expect(screen.getByText('Replying to Pat')).toBeTruthy()
  expect(screen.queryByText('Replying to Quinn')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Send again' }))
  await waitFor(() => expect(box().readOnly).toBe(false))
  expect(
    page.host.requests
      .filter((request) => request.method === 'dart.addComment')
      .map((request) => request.params)
  ).toEqual([
    expect.objectContaining({ parentId: 'p' }),
    expect.objectContaining({ parentId: 'p' })
  ])
})

it('keeps the unknown notice beside an oversize refusal and after shortening (R6)', async () => {
  const page = openRenderedDartDetail()
  await screen.findByText('No comments yet.')
  page.host.lostReplies.push(UNKNOWN)
  type('Body')
  fireEvent.click(send())
  await screen.findByRole('button', { name: 'Send again' })
  type('x'.repeat(50_001))
  fireEvent.click(send())
  expect(screen.getByRole('alert').textContent).toContain('too long')
  expect(screen.getByRole('status').textContent).toContain('may have posted')
  type('Short')
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByRole('status').textContent).toContain('may have posted')
  type('Body')
  expect(send().disabled).toBe(true)
  expect(page.host.count('dart.addComment')).toBe(1)
})

it('really stays pending while its post-success read is held', async () => {
  const page = openRenderedDartDetail()
  await screen.findByText('No comments yet.')
  const gate = Promise.withResolvers<void>()
  const handle = page.host.handle.bind(page.host)
  let reading = false
  page.host.handle = async (method, params) => {
    if (method === 'dart.listComments') {
      reading = true
      await gate.promise
    }
    return handle(method, params)
  }
  type('Pending reload')
  fireEvent.click(send())
  await waitFor(() => expect(reading).toBe(true))
  expect(box().readOnly).toBe(true)
  expect(box().closest('[aria-busy]')?.getAttribute('aria-busy')).toBe('true')
  type('Another comment')
  fireEvent.click(send())
  expect(page.host.count('dart.addComment')).toBe(1)
  await act(async () => gate.resolve())
  await waitFor(() => expect(box().readOnly).toBe(false))
  expect(within(document.querySelector('article')!).getByText('Pending reload')).toBeTruthy()
})
