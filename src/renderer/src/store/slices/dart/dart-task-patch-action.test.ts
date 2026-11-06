import { describe, expect, it } from 'vitest'
import { createTestStore } from '../store-test-helpers'
import { dartTaskFixture } from './dart-fake-runtime.test-support'
import { getDartReadScope } from './dart-read-coordination'
import { dartTaskIdentity, registerDartCacheAlias } from './dart-task-identity'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'

const TASK_ID = 'aB3dE5gH7jK9'
const FRESH = 1_000

function seedAlias(
  store: ReturnType<typeof createTestStore>,
  env: string,
  userId: string | null,
  projectId = 'project-1'
) {
  const sourceContext: TaskSourceContext = {
    kind: 'task-source',
    provider: 'dart',
    projectId,
    hostId: `runtime:${env}`,
    providerIdentity: userId ? { provider: 'dart', userId } : null
  }
  const scope = getDartReadScope(null, sourceContext)
  registerDartCacheAlias(scope, userId)
  const prefix = scope.cachePrefix
  const task = dartTaskFixture(TASK_ID)
  store.setState((state) => ({
    dartTaskCache: {
      ...state.dartTaskCache,
      [`${prefix}::task::${TASK_ID}`]: { data: task, fetchedAt: FRESH }
    },
    dartListCache: {
      ...state.dartListCache,
      [`${prefix}::list::{}`]: { data: { tasks: [task], totalCount: 1 }, fetchedAt: FRESH }
    }
  }))
  return {
    identity: dartTaskIdentity(scope, TASK_ID, userId),
    view: () => ({
      detail: store.getState().dartTaskCache[`${prefix}::task::${TASK_ID}`],
      list: store.getState().dartListCache[`${prefix}::list::{}`]
    })
  }
}

function seedGroups(env: string) {
  const store = createTestStore()
  return {
    store,
    a: seedAlias(store, env, 'user-a'),
    b: seedAlias(store, env, 'user-b'),
    unknown: seedAlias(store, env, null),
    unknownTwo: seedAlias(store, env, null, 'project-2'),
    otherHost: seedAlias(store, `${env}-other`, 'user-a')
  }
}

describe('patchDartTask', () => {
  it('patches and marks stale only the group of the identity', () => {
    const { store, a, b, unknown, otherHost } = seedGroups('patch-known')

    store.getState().patchDartTask(a.identity, { status: 'Done' })

    expect(a.view().detail).toMatchObject({ data: { status: 'Done' }, fetchedAt: 0 })
    expect(a.view().list?.fetchedAt).toBe(0)
    expect(a.view().list?.data?.tasks[0].status).toBe('Done')
    for (const untouched of [b, unknown, otherHost]) {
      expect(untouched.view().detail).toMatchObject({
        data: { status: 'To-do' },
        fetchedAt: FRESH
      })
      expect(untouched.view().list?.fetchedAt).toBe(FRESH)
      expect(untouched.view().list?.data?.tasks[0].status).toBe('To-do')
    }
  })

  it('links two unknown aliases with each other and with nothing known', () => {
    const { store, a, b, unknown, unknownTwo } = seedGroups('patch-unknown')

    store.getState().patchDartTask(unknown.identity, { priority: 'High' })

    expect(unknown.view().detail?.data?.priority).toBe('High')
    expect(unknownTwo.view().list?.data?.tasks[0].priority).toBe('High')
    expect(a.view().detail?.data?.priority).toBe('Medium')
    expect(b.view().list?.data?.tasks[0].priority).toBe('Medium')
  })

  it('keeps a description off list rows', () => {
    const { store, a } = seedGroups('patch-description')

    store.getState().patchDartTask(a.identity, { description: 'New text', title: 'New title' })

    expect(a.view().detail?.data).toMatchObject({ description: 'New text', title: 'New title' })
    expect(a.view().list?.data?.tasks[0].title).toBe('New title')
    expect(a.view().list?.data?.tasks[0]).not.toHaveProperty('description')
  })
})

describe('invalidateDartLists', () => {
  it('marks stale only the lists of the same host and account', () => {
    const { store, a, b, unknown, otherHost } = seedGroups('invalidate')

    store.getState().invalidateDartLists(a.identity)

    expect(a.view().list?.fetchedAt).toBe(0)
    expect(a.view().detail?.fetchedAt).toBe(FRESH)
    for (const untouched of [b, unknown, otherHost]) {
      expect(untouched.view().list?.fetchedAt).toBe(FRESH)
    }
  })
})
