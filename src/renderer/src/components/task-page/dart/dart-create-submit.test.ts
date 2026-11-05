import type { DartCreateSession } from '@/store/slices/task-creation-drafts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { state, listTasks, createTask } = vi.hoisted(() => {
  const dartCreateSessions: Record<string, DartCreateSession> = {}
  return { state: { dartCreateSessions }, listTasks: vi.fn(), createTask: vi.fn() }
})

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({
      dartCreateSessions: state.dartCreateSessions,
      dartCreateOwners: {
        [dartScopeHostKey(scope)]: { activeOwner: 'u1', keys: { u1: 'create' } }
      },
      patchDartCreateSession: (key: string, patch: Partial<DartCreateSession>) => {
        state.dartCreateSessions[key] = { ...state.dartCreateSessions[key], ...patch }
      },
      createDartTask: createTask,
      clearDartCreateSession: (key: string) => {
        delete state.dartCreateSessions[key]
      }
    })
  }
}))

vi.mock('@/runtime/runtime-dart-client', () => ({
  dartListTasksForTarget: (_target: unknown, args: unknown) => listTasks(args)
}))

import { dartScopeHostKey } from '@/store/slices/dart/dart-task-identity'
import { getDartReadScope } from '@/store/slices/dart/dart-read-coordination'
import { checkDartCreateSession, submitDartCreate } from './dart-create-submit'

const scope = getDartReadScope({ activeRuntimeEnvironmentId: null })
const session = (draft: Partial<DartCreateSession['draft']> = {}): DartCreateSession => ({
  draft: {
    title: 'Draft title',
    description: '',
    dartboard: '',
    type: '',
    status: '',
    priority: '',
    assignee: '',
    tags: [],
    dueAt: '',
    ...draft
  },
  lookupDraft: null,
  unknown: true,
  submitting: false,
  notice: { kind: 'unknown', message: 'old' },
  listChecked: false,
  matches: [],
  truncated: false,
  matchesDismissed: false,
  lookingUp: false,
  lookupSequence: 0,
  editable: false
})

beforeEach(() => {
  state.dartCreateSessions = { create: session() }
  listTasks.mockReset()
  createTask.mockReset()
})

describe('checkDartCreateSession', () => {
  it('recovers after a rejected list request and allows a retry', async () => {
    listTasks
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ok: true, tasks: [] })
    await checkDartCreateSession('create', scope)
    expect(state.dartCreateSessions.create).toMatchObject({
      lookingUp: false,
      listChecked: false,
      notice: { kind: 'unknown' }
    })
    expect(state.dartCreateSessions.create.notice?.message).toContain('offline')
    await checkDartCreateSession('create', scope)
    expect(state.dartCreateSessions.create).toMatchObject({
      lookingUp: false,
      listChecked: true,
      notice: { kind: 'unknown' }
    })
  })

  it('keeps the newer lookup in flight when an older lookup settles first', async () => {
    const oldReply = Promise.withResolvers<{ ok: boolean; tasks: [] }>()
    const newReply = Promise.withResolvers<{ ok: boolean; tasks: [] }>()
    listTasks.mockReturnValueOnce(oldReply.promise).mockReturnValueOnce(newReply.promise)
    const old = checkDartCreateSession('create', scope)
    const oldSequence = state.dartCreateSessions.create.lookupSequence
    const newer = checkDartCreateSession('create', scope)
    const newSequence = state.dartCreateSessions.create.lookupSequence
    expect(newSequence).toBeGreaterThan(oldSequence)
    oldReply.resolve({ ok: true, tasks: [] })
    await old
    expect(state.dartCreateSessions.create).toMatchObject({
      lookupSequence: newSequence,
      listChecked: false,
      lookingUp: true
    })
    newReply.resolve({ ok: true, tasks: [] })
    await newer
    expect(state.dartCreateSessions.create).toMatchObject({
      lookupSequence: newSequence,
      listChecked: true,
      lookingUp: false
    })
  })

  it('uses the canonical submitted board saved in the lookup draft', async () => {
    listTasks.mockResolvedValue({ ok: true, tasks: [] })
    state.dartCreateSessions.create.lookupDraft = {
      ...session().draft,
      title: 'Submitted title',
      dartboard: 'Canonical board'
    }
    await checkDartCreateSession('create', scope)
    expect(listTasks).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Submitted title', dartboard: 'Canonical board' })
    )
  })

  it('rejects a concurrent create without issuing another write', async () => {
    const pending = Promise.withResolvers<{ ok: false; outcome: 'notApplied'; error: string }>()
    createTask.mockReturnValueOnce(pending.promise)
    const args = { title: 'Draft title', dartboard: 'Board' }
    const onSuccess = vi.fn()
    const first = submitDartCreate(args, { key: 'create', scope, onSuccess })
    const second = await submitDartCreate(args, { key: 'create', scope, onSuccess })
    expect(second).toMatchObject({ ok: false, outcome: 'notApplied' })
    expect(createTask).toHaveBeenCalledOnce()
    expect(state.dartCreateSessions.create.submitting).toBe(true)
    pending.resolve({ ok: false, outcome: 'notApplied', error: 'refused' })
    await first
    expect(state.dartCreateSessions.create.submitting).toBe(false)
    expect(onSuccess).not.toHaveBeenCalled()
  })
})
