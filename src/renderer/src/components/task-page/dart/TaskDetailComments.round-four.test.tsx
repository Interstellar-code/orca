// @vitest-environment happy-dom

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import type { DartComment } from '../../../../../shared/dart/dart-types'
import { dartDraftKey } from './dart-draft-store'
import { getDartCommentSendState } from './dart-comment-send-state'
import { setDartReplyTarget } from './dart-reply-target-store'
import {
  openRenderedDartDetail,
  setUpRenderedDartDetail,
  tearDownRenderedDartDetail
} from './dart-task-detail.test-support'

const UNKNOWN = {
  ok: false,
  error: 'Lost reply',
  errorCode: 'dart.commentFailed',
  outcome: 'unknown'
} as const

const comment = (id: string, text: string, author: string): DartComment => ({
  id,
  text,
  author,
  taskId: 'task',
  htmlUrl: `https://app.dartai.com/c/${id}`
})

beforeEach(() => setUpRenderedDartDetail())
afterEach(() => tearDownRenderedDartDetail())

it('resends each unknown body to its own original parent (N6)', async () => {
  const p = comment('p', 'Parent P', 'Pat')
  const q = comment('q', 'Parent Q', 'Quinn')
  const page = openRenderedDartDetail({ comments: [p, q] })
  const key = dartDraftKey(
    { hostKey: `runtime:${page.pageEnv}`, accountKey: 'user-a' },
    page.task.id,
    'comment'
  )
  await screen.findByText('Parent P')
  const article = screen.getByText('Parent P').closest('article')
  if (!article) {
    throw new Error('Missing Parent P article')
  }
  fireEvent.click(within(article).getByRole('button', { name: 'Reply' }))
  page.host.lostReplies.push(UNKNOWN)
  fireEvent.change(screen.getByRole('textbox', { name: 'Comment' }), {
    target: { value: 'Body one' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Send comment' }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Send again' }).hasAttribute('disabled')).toBe(false)
  )

  const qArticle = screen.getByText('Parent Q').closest('article')
  if (!qArticle) {
    throw new Error('Missing Parent Q article')
  }
  expect(within(qArticle).getByRole('button', { name: 'Reply' }).hasAttribute('disabled')).toBe(
    true
  )
  // The UI intentionally locks reply targets while any body is uncertain. Model a target
  // transition with the existing store while preserving the real first unknown outcome.
  act(() => setDartReplyTarget(key, q))
  expect(screen.getByText('Replying to Pat')).toBeTruthy()
  page.host.lostReplies.push(UNKNOWN)
  fireEvent.change(screen.getByRole('textbox', { name: 'Comment' }), {
    target: { value: 'Body two' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Send comment' }))
  await waitFor(() => {
    expect(getDartCommentSendState(key).uncertainBodies.get('Body two')).toEqual({
      id: 'q',
      author: 'Quinn'
    })
    expect(screen.getByRole('button', { name: 'Send again' }).hasAttribute('disabled')).toBe(false)
  })
  expect(getDartCommentSendState(key).uncertainBodies.get('Body one')).toEqual({
    id: 'p',
    author: 'Pat'
  })
  expect(getDartCommentSendState(key).uncertainBodies.get('Body two')).toEqual({
    id: 'q',
    author: 'Quinn'
  })

  for (const [body, author] of [
    ['Body one', 'Pat'],
    ['Body two', 'Quinn']
  ] as const) {
    fireEvent.change(screen.getByRole('textbox', { name: 'Comment' }), {
      target: { value: body }
    })
    expect(screen.getByText(`Replying to ${author}`)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send comment' }).hasAttribute('disabled')).toBe(true)
    expect(page.host.count('dart.addComment')).toBe(2)
  }

  fireEvent.change(screen.getByRole('textbox', { name: 'Comment' }), {
    target: { value: 'Body one' }
  })

  fireEvent.change(screen.getByRole('textbox', { name: 'Comment' }), {
    target: { value: 'Body one' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Send again' }))
  await waitFor(() => expect(page.host.count('dart.addComment')).toBe(3))
  await waitFor(() => expect(getDartCommentSendState(key).inFlight).toBe(false))
  expect(getDartCommentSendState(key).uncertainBodies.get('Body two')).toEqual({
    id: 'q',
    author: 'Quinn'
  })
  fireEvent.change(screen.getByRole('textbox', { name: 'Comment' }), {
    target: { value: 'Body two' }
  })
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Send again' }).hasAttribute('disabled')).toBe(false)
  )
  fireEvent.click(screen.getByRole('button', { name: 'Send again' }))
  await waitFor(() => expect(page.host.count('dart.addComment')).toBe(4))

  const requests = page.host.requests
    .filter((request) => request.method === 'dart.addComment')
    .map((request) => request.params)
  expect(requests).toEqual([
    expect.objectContaining({ text: 'Body one', parentId: 'p' }),
    expect.objectContaining({ text: 'Body two', parentId: 'q' }),
    expect.objectContaining({ text: 'Body one', parentId: 'p' }),
    expect.objectContaining({ text: 'Body two', parentId: 'q' })
  ])
})
