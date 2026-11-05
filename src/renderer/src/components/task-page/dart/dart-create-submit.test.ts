import type { DartCreateSession } from '@/store/slices/task-creation-drafts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { state, listTasks } = vi.hoisted(() => {
  const dartCreateSessions: Record<string, DartCreateSession> = {}
  return { state: { dartCreateSessions }, listTasks: vi.fn() }
})

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({
      dartCreateSessions: state.dartCreateSessions,
      patchDartCreateSession: (key: string, patch: Partial<DartCreateSession>) => {
        state.dartCreateSessions[key] = { ...state.dartCreateSessions[key], ...patch }
      }
    })
  }
}))
vi.mock('@/runtime/runtime-dart-client', () => ({
  dartListTasksForTarget: (_target: unknown, args: unknown) => listTasks(args)
}))

import { getDartReadScope } from '@/store/slices/dart/dart-read-coordination'
import { checkDartCreateSession } from './dart-create-submit'

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
    await checkDartCreateSession('create', scope)
    expect(state.dartCreateSessions.create).toMatchObject({
      lookingUp: false,
      listChecked: true,
      notice: { kind: 'unknown' }
    })
  })

  it('does not let an older lookup overwrite the newer result', async () => {
    const { promise, resolve } = Promise.withResolvers<{ ok: boolean; tasks: [] }>()
    listTasks.mockReturnValueOnce(promise).mockResolvedValueOnce({ ok: true, tasks: [] })
    const old = checkDartCreateSession('create', scope)
    const newer = checkDartCreateSession('create', scope)
    await newer
    const sequence = state.dartCreateSessions.create.lookupSequence
    resolve({ ok: true, tasks: [] })
    await old
    expect(state.dartCreateSessions.create).toMatchObject({
      lookupSequence: sequence,
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
})
