// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { DartComment } from '../../../../../shared/dart/dart-types'
import { TooltipProvider } from '@/components/ui/tooltip'
import { DartCommentComposer } from './DartCommentComposer'
import {
  clearDartCommentSendState,
  getDartCommentSendState,
  patchDartCommentSendState
} from './dart-comment-send-state'
import { clearDraft, dartDraftKey, setDraft } from './dart-draft-store'
import { getDartReplyTarget, setDartReplyTarget } from './dart-reply-target-store'

const identity = { hostKey: 'runtime:safety', accountKey: 'viewer' }
const keys: string[] = []
function key(id: string) {
  const result = dartDraftKey(identity, id, 'comment')
  keys.push(result)
  return result
}
function comment(id: string): DartComment {
  return {
    id,
    taskId: 'task',
    htmlUrl: 'https://app.dartai.com/c/1',
    author: 'Alex',
    text: 'Same',
    createdAt: '2026-11-04T10:00:00Z'
  }
}
afterEach(() => {
  cleanup()
  for (const k of keys) {
    setDartReplyTarget(k, null)
    clearDraft(k)
    clearDartCommentSendState(k)
  }
  keys.length = 0
})

it('does not treat the pre-send duplicate as the result of an unknown Post anyway', async () => {
  const draftKey = key('duplicate')
  const old = comment('old')
  const read = vi.fn().mockResolvedValue([old])
  const add = vi.fn().mockResolvedValue({ ok: false, outcome: 'unknown', error: 'lost' })
  render(
    <TooltipProvider>
      <DartCommentComposer
        draftKey={draftKey}
        replyTo={null}
        onCancelReply={() => {}}
        onAddComment={add}
        reloadComments={vi.fn().mockResolvedValue(undefined)}
        appendLocalComment={() => {}}
        readLatestComments={read}
        viewerName="Alex"
      />
    </TooltipProvider>
  )
  fireEvent.change(screen.getByRole('textbox', { name: 'Comment' }), { target: { value: 'Same' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send comment' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Post anyway' }))
  await screen.findByText('Not sure it posted')
  fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
  await waitFor(() => expect(read).toHaveBeenCalledTimes(3))
  await waitFor(() => expect(getDartCommentSendState(draftKey).notice?.checkedAt).toBeDefined())
  expect(screen.getByRole('textbox', { name: 'Comment' })).toHaveProperty('value', 'Same')
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Check again' }).hasAttribute('disabled')).toBe(false)
  )
  read.mockResolvedValue([old, comment('new')])
  fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'Comment' })).toHaveProperty('value', '')
  )
  expect(add).toHaveBeenCalledTimes(1)
})

it('retains reply targets with saved or unsaved text during target eviction', () => {
  const saved = key('saved')
  const unsaved = key('unsaved')
  setDartReplyTarget(saved, comment('saved-parent'))
  setDraft(saved, 'saved reply', { dirty: true })
  setDartReplyTarget(unsaved, comment('unsaved-parent'))
  patchDartCommentSendState(unsaved, { text: 'unsaved reply', saved: false })
  for (let i = 0; i < 25; i++) {
    setDartReplyTarget(key(`empty-${i}`), comment(`parent-${i}`))
  }
  expect(getDartReplyTarget(saved)?.id).toBe('saved-parent')
  expect(getDartReplyTarget(unsaved)?.id).toBe('unsaved-parent')
})

it('retries unknown viewer status without posting', async () => {
  const retry = vi.fn()
  const add = vi.fn()
  render(
    <TooltipProvider>
      <DartCommentComposer
        draftKey={key('viewer')}
        replyTo={null}
        onCancelReply={() => {}}
        onAddComment={add}
        reloadComments={vi.fn().mockResolvedValue(undefined)}
        appendLocalComment={() => {}}
        readLatestComments={vi.fn().mockResolvedValue([])}
        viewerName={null}
        onRetry={retry}
      />
    </TooltipProvider>
  )
  fireEvent.change(screen.getByRole('textbox', { name: 'Comment' }), { target: { value: 'Hello' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send comment' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
  expect(retry).toHaveBeenCalledTimes(1)
  expect(add).not.toHaveBeenCalled()
})
