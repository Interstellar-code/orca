// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import {
  EMPTY_DART_CREATE_SESSION,
  type DartCreateSession
} from '@/store/slices/task-creation-drafts'
import { getDartCommentSendState, patchDartCommentSendState } from './dart-comment-send-state'
import { watchDartCreateDraftAccounting } from './dart-create-draft-accounting'
import { dartFullDraftTarget, discardDartDraft } from './dart-draft-eviction'
import {
  clearDraft,
  dartDraftKey,
  dirtyDraftCount,
  discardDirtyDrafts,
  getDraft,
  setDraft
} from './dart-draft-store'

const CREATE_KEY = JSON.stringify(['local', 'create', 'user-a'])
const CREATE_DRAFT = dartDraftKey({ hostKey: 'local', accountKey: 'user-a' }, 'new-task', 'create')
const COMMENT_DRAFT = dartDraftKey({ hostKey: 'local', accountKey: 'user-a' }, 'task-1', 'comment')

function typeNewTask(patch: Partial<DartCreateSession> = {}): void {
  useAppStore.getState().patchDartCreateSession(CREATE_KEY, {
    draft: { ...EMPTY_DART_CREATE_SESSION.draft, title: 'Ship it' },
    ...patch
  })
}

beforeEach(() => {
  watchDartCreateDraftAccounting()
  useAppStore.setState({ dartCreateSessions: {} })
})

afterEach(() => {
  useAppStore.setState({ dartCreateSessions: {} })
  clearDraft(COMMENT_DRAFT)
  clearDraft(CREATE_DRAFT)
  discardDirtyDrafts('local')
})

describe('drafts-full eviction of a New task draft', () => {
  it('discarding it from any warning also drops the dialog session', () => {
    typeNewTask()
    expect(getDraft(CREATE_DRAFT)).toBe('Ship it')

    expect(discardDartDraft(CREATE_DRAFT)).toBe(true)

    expect(useAppStore.getState().dartCreateSessions[CREATE_KEY]).toBeUndefined()
    expect(getDraft(CREATE_DRAFT)).toBeUndefined()
  })

  it('discarding a comment draft clears its send state too', () => {
    setDraft(COMMENT_DRAFT, 'half a thought', { dirty: true })
    patchDartCommentSendState(COMMENT_DRAFT, { text: 'half a thought', saved: false })

    expect(discardDartDraft(COMMENT_DRAFT)).toBe(true)

    expect(getDartCommentSendState(COMMENT_DRAFT).text).toBeNull()
    expect(getDraft(COMMENT_DRAFT)).toBeUndefined()
  })

  it.each([
    ['may have landed', { unknown: true }],
    ['is being sent', { submitting: true }]
  ] as const)(
    'keeps the session of a create that %s, skips it for the next oldest draft, and refuses to discard it',
    (_label, state) => {
      typeNewTask(state)
      setDraft(COMMENT_DRAFT, 'newer comment', { dirty: true })

      expect(dartFullDraftTarget()).toMatchObject({ key: COMMENT_DRAFT, discardable: true })
      expect(discardDartDraft(CREATE_DRAFT)).toBe(false)

      const session = useAppStore.getState().dartCreateSessions[CREATE_KEY]
      expect(session?.draft.title).toBe('Ship it')
      expect(session).toMatchObject(state)
      expect(dirtyDraftCount('local')).toBe(2)
    }
  )

  it('offers a protected create copy-only when nothing else can be discarded', () => {
    typeNewTask({ unknown: true })

    expect(dartFullDraftTarget()).toEqual({
      key: CREATE_DRAFT,
      value: 'Ship it',
      discardable: false
    })
  })
})
