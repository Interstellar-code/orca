import { createStore, type StoreApi } from 'zustand/vanilla'
import { describe, expect, it } from 'vitest'
import type { AppState } from '../types'
import type { DartTask } from '../../../../shared/dart/dart-types'
import type { TaskSourceContext } from '../../../../shared/task-source-context'
import {
  createWorktreeNavHistorySlice,
  type WorktreeNavHistoryTaskDetailEntry
} from './worktree-nav-history'

type MinimalState = Pick<
  AppState,
  'worktreeNavHistory' | 'worktreeNavHistoryIndex' | 'recordViewVisit'
>

function createHistoryStore(): StoreApi<MinimalState> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createStore<any>()((set, get, api) => ({
    worktreesByRepo: {},
    ...createWorktreeNavHistorySlice(
      set as Parameters<typeof createWorktreeNavHistorySlice>[0],
      get as Parameters<typeof createWorktreeNavHistorySlice>[1],
      api as Parameters<typeof createWorktreeNavHistorySlice>[2]
    )
  })) as unknown as StoreApi<MinimalState>
}

const task = (id: string): DartTask => ({
  id,
  title: 'Search results ignore archived projects',
  htmlUrl: `https://app.dartai.com/t/${id}`,
  tags: []
})

const source = (userId: string): TaskSourceContext => ({
  kind: 'task-source',
  provider: 'dart',
  projectId: 'account-backed-task-source',
  hostId: 'local',
  providerIdentity: { provider: 'dart', userId }
})

const entry = (id: string, userId: string): WorktreeNavHistoryTaskDetailEntry => ({
  kind: 'task-detail',
  source: 'dart',
  task: task(id),
  sourceContext: source(userId)
})

describe('Dart task detail history entries', () => {
  it('collapses a repeat visit to the same task and account', () => {
    const store = createHistoryStore()
    store.getState().recordViewVisit(entry('aB3dE5gH7jK9', 'uSeR1d2e3f4g'))
    store.getState().recordViewVisit(entry('aB3dE5gH7jK9', 'uSeR1d2e3f4g'))
    expect(store.getState().worktreeNavHistory).toHaveLength(1)
  })

  it('keeps different tasks as separate entries even though both are number 0', () => {
    const store = createHistoryStore()
    store.getState().recordViewVisit(entry('aB3dE5gH7jK9', 'uSeR1d2e3f4g'))
    store.getState().recordViewVisit(entry('zYxW9vUt8sRq', 'uSeR1d2e3f4g'))
    expect(store.getState().worktreeNavHistory).toHaveLength(2)
    expect(store.getState().worktreeNavHistoryIndex).toBe(1)
  })

  it('keeps the same task opened under a different signed-in user separate', () => {
    const store = createHistoryStore()
    store.getState().recordViewVisit(entry('aB3dE5gH7jK9', 'uSeR1d2e3f4g'))
    store.getState().recordViewVisit(entry('aB3dE5gH7jK9', 'oThEr1d2e3f4'))
    expect(store.getState().worktreeNavHistory).toHaveLength(2)
  })
})
