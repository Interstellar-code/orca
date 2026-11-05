// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { DartComment } from '../../../../../shared/dart/dart-types'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { DartIntegrationCard } from '@/components/settings/dart-integration-card'
import { getDartCommentSendState } from './dart-comment-send-state'
import { dartDraftKey } from './dart-draft-store'
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
function isCommentReply(reply: object): reply is { comment: DartComment } {
  return 'comment' in reply
}
function box(): HTMLTextAreaElement {
  const element = screen.getByRole('textbox', { name: 'Comment' })
  if (!(element instanceof HTMLTextAreaElement)) {
    throw new Error('Missing comment textarea')
  }
  return element
}
function send(): HTMLButtonElement {
  const element = screen.getByRole('button', { name: 'Send comment' })
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error('Missing send button')
  }
  return element
}
const typeComment = (text: string): void => {
  fireEvent.change(box(), { target: { value: text } })
}
let originalDisconnect: typeof useAppStore.getState extends () => infer S
  ? S extends { disconnectDart: infer D }
    ? D
    : never
  : never

beforeEach(() => {
  setUpRenderedDartDetail()
  originalDisconnect = useAppStore.getState().disconnectDart
})
afterEach(() => {
  useAppStore.setState({ disconnectDart: originalDisconnect })
  cleanup()
  tearDownRenderedDartDetail()
})
function renderIntegrationCard(): void {
  render(
    <TooltipProvider>
      <DartIntegrationCard />
    </TooltipProvider>
  )
}

it('keeps a late unknown result blocked after Discard and disconnect, then retype (N8b)', async () => {
  const page = openRenderedDartDetail()
  await screen.findByText('No comments yet.')
  const key = dartDraftKey(
    { hostKey: `runtime:${page.pageEnv}`, accountKey: 'user-a' },
    page.task.id,
    'comment'
  )
  page.host.lostReplies.push(UNKNOWN)
  const release = page.host.hold('dart.addComment')
  typeComment('Unknown after discard')
  fireEvent.click(send())
  await waitFor(() => expect(page.host.count('dart.addComment')).toBe(1))
  useAppStore.setState({ disconnectDart: vi.fn(async () => ({ ok: true as const })) })
  renderIntegrationCard()
  fireEvent.click(screen.getByRole('button', { name: 'Disconnect Dart' }))
  fireEvent.click(screen.getByRole('button', { name: 'Discard and disconnect' }))
  await waitFor(() => expect(useAppStore.getState().disconnectDart).toHaveBeenCalledOnce())
  page.unmount()
  await act(async () => release())
  page.remount()
  await screen.findByRole('textbox', { name: 'Comment' })
  typeComment('Unknown after discard')
  expect(send().disabled).toBe(true)
  expect(getDartCommentSendState(key).uncertainBodies.has('Unknown after discard')).toBe(true)
})

it('shows a late successful result after Discard and disconnect instead of losing it (N8b)', async () => {
  const comments: DartComment[] = []
  const page = openRenderedDartDetail({ comments })
  await screen.findByText('No comments yet.')
  const handle = page.host.handle.bind(page.host)
  page.host.handle = async (method, params) => {
    const result = await handle(method, params)
    if (method === 'dart.addComment' && isCommentReply(result)) {
      comments.push(result.comment)
    }
    return result
  }
  const release = page.host.hold('dart.addComment')
  typeComment('Success after discard')
  fireEvent.click(send())
  await waitFor(() => expect(page.host.count('dart.addComment')).toBe(1))
  useAppStore.setState({ disconnectDart: vi.fn(async () => ({ ok: true as const })) })
  renderIntegrationCard()
  fireEvent.click(screen.getByRole('button', { name: 'Disconnect Dart' }))
  fireEvent.click(screen.getByRole('button', { name: 'Discard and disconnect' }))
  await waitFor(() => expect(useAppStore.getState().disconnectDart).toHaveBeenCalledOnce())
  page.unmount()
  await act(async () => release())
  page.remount()
  await screen.findByText('Success after discard')
  expect(document.querySelectorAll('article')).toHaveLength(1)
})
