import { afterEach, describe, expect, it } from 'vitest'
import type { DartComment } from '../../../../../shared/dart/dart-types'
import { clearDraft, dartDraftKey, getDraft, setDraft } from './dart-draft-store'
import { getDartReplyTarget, setDartReplyTarget } from './dart-reply-target-store'

const IDENTITY = { hostKey: 'local', accountKey: 'user-a' }
const used = new Set<string>()

function key(taskId: string): string {
  const built = dartDraftKey(IDENTITY, taskId, 'comment')
  used.add(built)
  return built
}

function comment(id: string): DartComment {
  return {
    id,
    taskId: 'task',
    htmlUrl: `https://app.dartai.com/c/${id}`,
    author: 'Alex',
    text: id,
    createdAt: '2026-11-04T10:00:00Z'
  }
}

afterEach(() => {
  for (const draftKey of used) {
    setDartReplyTarget(draftKey, null)
    clearDraft(draftKey)
  }
  used.clear()
})

describe('dart reply target store', () => {
  it('restores the target for its draft key after a remount', () => {
    const draftKey = key('task-1')
    setDartReplyTarget(draftKey, comment('root1'))

    setDraft(draftKey, 'A reply', { dirty: true })
    expect(getDartReplyTarget(draftKey)?.id).toBe('root1')
  })

  it('keeps an untyped reply target even when the bounded draft store is full', () => {
    const draftKey = key('task-1-full')
    for (let index = 0; index < 20; index += 1) {
      setDraft(key(`other-${index}`), `draft ${index}`, { dirty: true })
    }

    setDartReplyTarget(draftKey, comment('root1'))

    expect(getDartReplyTarget(draftKey)?.id).toBe('root1')
  })

  it('drops the target when it is cleared and never shares it between tasks', () => {
    const draftKey = key('task-2')
    setDartReplyTarget(draftKey, comment('root2'))
    setDraft(draftKey, 'A reply', { dirty: true })

    setDartReplyTarget(draftKey, null)
    expect(getDartReplyTarget(draftKey)).toBeNull()
    expect(getDraft(draftKey)).toBe('A reply')

    setDartReplyTarget(key('task-a'), comment('rootA'))
    expect(getDartReplyTarget(key('task-b'))).toBeNull()
  })

  it('never shares a target between tasks', () => {
    setDartReplyTarget(key('task-a'), comment('rootA'))

    expect(getDartReplyTarget(key('task-b'))).toBeNull()
  })
})
