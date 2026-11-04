import { afterEach, describe, expect, it } from 'vitest'
import {
  clearDraft,
  dartDraftKey,
  dirtyDraftCount,
  dirtyDraftTexts,
  discardDirtyDrafts,
  getDraft,
  oldestDirtyDraft,
  setDraft
} from './dart-draft-store'

const LOCAL = { hostKey: 'local', accountKey: 'user-a' }
const REMOTE = { hostKey: 'runtime:remote', accountKey: 'user-a' }
const used = new Set<string>()

function key(identity: typeof LOCAL, taskId: string): string {
  const built = dartDraftKey(identity, taskId, 'comment')
  used.add(built)
  return built
}

afterEach(() => {
  for (const draftKey of used) {
    clearDraft(draftKey)
  }
  used.clear()
})

describe('dart draft store', () => {
  it('evicts the oldest clean entry past 20 and never a dirty one', () => {
    setDraft(key(LOCAL, 'clean-first'), '', { dirty: false })
    setDraft(key(LOCAL, 'dirty-kept'), 'typed', { dirty: true })
    for (let index = 0; index < 19; index += 1) {
      setDraft(key(LOCAL, `clean-${index}`), '', { dirty: false })
    }

    expect(getDraft(key(LOCAL, 'clean-first'))).toBeUndefined()
    expect(getDraft(key(LOCAL, 'clean-0'))).toBe('')
    expect(getDraft(key(LOCAL, 'dirty-kept'))).toBe('typed')
  })

  it('refuses the 21st dirty draft and deletes nothing', () => {
    for (let index = 0; index < 20; index += 1) {
      expect(setDraft(key(LOCAL, `task-${index}`), `text ${index}`, { dirty: true })).toBe('ok')
    }

    expect(setDraft(key(LOCAL, 'task-20'), 'one too many', { dirty: true })).toBe('full')

    expect(getDraft(key(LOCAL, 'task-20'))).toBeUndefined()
    expect(dirtyDraftCount(LOCAL.hostKey)).toBe(20)
    expect(oldestDirtyDraft()).toEqual({ key: key(LOCAL, 'task-0'), value: 'text 0' })
    // A draft that is already dirty can still be typed into, and discarding one makes room.
    expect(setDraft(key(LOCAL, 'task-5'), 'more text', { dirty: true })).toBe('ok')
    clearDraft(key(LOCAL, 'task-0'))
    expect(setDraft(key(LOCAL, 'task-20'), 'now it fits', { dirty: true })).toBe('ok')
  })

  it('keeps each host’s drafts under its own key', () => {
    setDraft(key(LOCAL, 'same-task'), 'local text', { dirty: true })
    setDraft(key(REMOTE, 'same-task'), 'remote text', { dirty: true })

    expect(getDraft(key(LOCAL, 'same-task'))).toBe('local text')
    expect(getDraft(key(REMOTE, 'same-task'))).toBe('remote text')
    expect(dirtyDraftCount(LOCAL.hostKey)).toBe(1)
    expect(dirtyDraftCount(REMOTE.hostKey)).toBe(1)

    discardDirtyDrafts(REMOTE.hostKey)

    expect(getDraft(key(LOCAL, 'same-task'))).toBe('local text')
    expect(getDraft(key(REMOTE, 'same-task'))).toBeUndefined()
  })

  it('holds a whole description lineage as one dirty draft and copies its editor text', () => {
    const lineage = {
      base: 'Paragraph A',
      draft: 'Paragraph B',
      unresolved: [{ id: 'hunk-1', baseText: 'Old', userText: 'Mine' }]
    }
    const descriptionKey = dartDraftKey(LOCAL, 'task-1', 'description')
    used.add(descriptionKey)
    setDraft(descriptionKey, lineage, { dirty: true })

    expect(getDraft(descriptionKey)).toEqual(lineage)
    expect(dirtyDraftCount(LOCAL.hostKey)).toBe(1)
    expect(dirtyDraftTexts(LOCAL.hostKey)).toEqual(['Paragraph B'])
  })

  it('does not count a clean entry as unsaved', () => {
    setDraft(key(LOCAL, 'task-1'), 'saved text', { dirty: false })

    expect(dirtyDraftCount(LOCAL.hostKey)).toBe(0)
    expect(dirtyDraftTexts(LOCAL.hostKey)).toEqual([])
  })
})
