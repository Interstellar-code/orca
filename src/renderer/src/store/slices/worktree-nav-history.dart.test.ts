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

// SAFETY lines below: the slice reads only the fields in MinimalState, so a narrow store stands in for AppState.
function createHistoryStore(): StoreApi<MinimalState> {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: narrow test store typed back to MinimalState.
  return createStore<MinimalState>()((set, get, api) => ({
    ...createWorktreeNavHistorySlice(
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: MinimalState is the subset of AppState the slice touches.
      set as unknown as Parameters<typeof createWorktreeNavHistorySlice>[0],
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: MinimalState is the subset of AppState the slice touches.
      get as unknown as Parameters<typeof createWorktreeNavHistorySlice>[1],
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: MinimalState is the subset of AppState the slice touches.
      api as unknown as Parameters<typeof createWorktreeNavHistorySlice>[2]
    )
  }))
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
