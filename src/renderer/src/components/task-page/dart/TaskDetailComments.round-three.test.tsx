// @vitest-environment happy-dom

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import type { DartComment } from '../../../../../shared/dart/dart-types'
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
