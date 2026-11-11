// @vitest-environment happy-dom

import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import { useAppStore } from '@/store'
import {
  dartTaskFixture,
  installFakeDartRuntime
} from '@/store/slices/dart/dart-fake-runtime.test-support'
import { getDartReadScope } from '@/store/slices/dart/dart-read-coordination'
import {
  dartAccountIdentity,
  dartTaskIdentity,
  dartTaskIdentityKey
} from '@/store/slices/dart/dart-task-identity'
import type { DartRelationshipCacheEntry, DartScopeMeta } from './dart-board-contracts'
import { useDartOnHoldRelationshipReads } from './use-dart-on-hold-relationship-reads'

const VIEWER_ID = 'user-a'
const SCOPE_KEY = 'scope-a'
const realWindow = window

// Generation and fetchedAt stay fixed unless a test varies them: only the store's publicationId names a publication.
function meta(publicationId: number | undefined, fetchedAt = 1000): DartScopeMeta {
  return {
    fetchedAt,
    openTotal: 0,
    doneTotal: 0,
    doneOffset: 0,
    generation: 1,
    incomplete: fetchedAt === 0,
    partialReason: null,
    publicationId
  }
}

function heldTasks(count: number, prefix = 'held'): DartTask[] {
  return Array.from({ length: count }, (_, index) =>
    dartTaskFixture(`${prefix}${String(index).padStart(2, '0')}`, { status: 'On Hold' })
  )
}

function knownEntry(): DartRelationshipCacheEntry {
  return {
    state: 'known',
    relationships: {
      subtaskIds: [],
      blockerIds: [],
      blockingIds: [],
      duplicateIds: [],
      relatedIds: []
    },
    fetchedAt: 5000,
    error: null
  }
}

function cacheKnown(hostKey: string, accountKey: string, ids: string[]): void {
  useAppStore.setState({
    dartRelationshipCache: Object.fromEntries(
      ids.map((taskId) => [dartTaskIdentityKey({ hostKey, accountKey, taskId }), knownEntry()])
    )
  })
}

type HookProps = {
  scopeKey?: string | null
  tasks: readonly DartTask[] | undefined
  scopeMeta: DartScopeMeta | null
}

// Like the store's own writes: a copy of the same publication keeps its on-hold marker, a newer one drops it.
function seedMeta(scopeKey: string, scopeMeta: DartScopeMeta | null): void {
  useAppStore.setState((state) => {
    const next = { ...state.dartScopeMetaCache }
    const previous = next[scopeKey]
    if (!scopeMeta) {
      delete next[scopeKey]
    } else if (previous && previous.publicationId === scopeMeta.publicationId) {
      next[scopeKey] = { ...scopeMeta, onHoldReadPublicationId: previous.onHoldReadPublicationId }
    } else {
      next[scopeKey] = scopeMeta
    }
    return { dartScopeMetaCache: next }
  })
}

function mountReads(initial: HookProps) {
  const pageScope = getDartReadScope(useAppStore.getState().settings)
  const scopeKeyOf = (props: HookProps): string | null =>
    props.scopeKey === undefined ? SCOPE_KEY : props.scopeKey
  const seed = (props: HookProps): void => {
    const key = scopeKeyOf(props)
    if (key) {
      seedMeta(key, props.scopeMeta)
    }
  }
  seed(initial)
  const hook = renderHook(
    (props: HookProps) => {
      const scopeKey = scopeKeyOf(props)
      const scopeMeta = useAppStore((s) =>
        scopeKey ? (s.dartScopeMetaCache[scopeKey] ?? null) : null
      )
      useDartOnHoldRelationshipReads({
        active: true,
        scopeKey,
        scopeEntryTasks: props.tasks,
        scopeMeta,
        pageScope,
        viewerId: VIEWER_ID
      })
    },
    { initialProps: initial }
  )
  return {
    unmount: hook.unmount,
    rerender: (props: HookProps): void => {
      seed(props)
      hook.rerender(props)
    }
  }
}

let readSpy: ReturnType<
  typeof vi.fn<(taskIds: readonly string[], options?: { publicationId?: number }) => Promise<void>>
>

beforeEach(() => {
  installFakeDartRuntime()
  const api = window.api
  vi.stubGlobal('window', realWindow)
  Object.assign(realWindow, { api })
  // Like the store, a read marks its tasks as loading before it returns.
  readSpy = vi.fn((taskIds: readonly string[]) => {
    const pageScope = getDartReadScope(useAppStore.getState().settings)
    useAppStore.setState((state) => ({
      dartRelationshipCache: {
        ...state.dartRelationshipCache,
        ...Object.fromEntries(
          taskIds.map((id) => [
            dartTaskIdentityKey(dartTaskIdentity(pageScope, id, VIEWER_ID)),
            { state: 'loading' as const, relationships: null, fetchedAt: 0, error: null }
          ])
        )
      }
    }))
    return Promise.resolve()
  })
  useAppStore.setState({
    dartRelationshipCache: {},
    dartScopeMetaCache: {},
    readDartOnHoldRelationships: readSpy
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('useDartOnHoldRelationshipReads', () => {
  it('reads on a partial first publication whose fetchedAt is 0', () => {
    const tasks = heldTasks(2)

    mountReads({ tasks, scopeMeta: meta(1, 0) })

    expect(readSpy).toHaveBeenCalledWith(
      tasks.map((task) => task.id),
      { publicationId: 1 }
    )
  })

  it('does not read a scope that was never published', () => {
    mountReads({ tasks: heldTasks(2), scopeMeta: meta(undefined) })

    expect(readSpy).not.toHaveBeenCalled()
  })

  it('ignores known entries that belong to another host or account', () => {
    const tasks = heldTasks(2)
    const pageScope = getDartReadScope(useAppStore.getState().settings)
    const own = dartAccountIdentity(pageScope, VIEWER_ID)
    cacheKnown('runtime:other-host', own.accountKey, [tasks[0].id, tasks[1].id])

    mountReads({ tasks, scopeMeta: meta(1) })

    expect(readSpy).toHaveBeenCalledWith(
      tasks.map((task) => task.id),
      { publicationId: 1 }
    )
  })

  it('reads the first 20 on-hold tasks of the read set even when some are already known', () => {
    const tasks = heldTasks(25)
    const pageScope = getDartReadScope(useAppStore.getState().settings)
    const own = dartAccountIdentity(pageScope, VIEWER_ID)
    cacheKnown(own.hostKey, own.accountKey, [tasks[0].id, tasks[1].id])

    mountReads({ tasks, scopeMeta: meta(1) })

    expect(readSpy).toHaveBeenCalledTimes(1)
    expect(readSpy).toHaveBeenCalledWith(
      tasks.slice(0, 20).map((task) => task.id),
      { publicationId: 1 }
    )
  })

  it('reads again for a second publication with the same generation and fetchedAt', () => {
    const first = heldTasks(1, 'first')
    const hook = mountReads({ tasks: first, scopeMeta: meta(1) })
    expect(readSpy).toHaveBeenCalledTimes(1)

    const second = heldTasks(1, 'second')
    hook.rerender({ tasks: second, scopeMeta: meta(2) })

    expect(readSpy).toHaveBeenCalledTimes(2)
    expect(readSpy).toHaveBeenLastCalledWith([second[0].id], { publicationId: 2 })
  })

  it('does not read again for the same publication when rows are re-selected or meta is copied', () => {
    const tasks = heldTasks(2)
    const hook = mountReads({ tasks, scopeMeta: meta(1) })

    hook.rerender({ tasks: [...tasks], scopeMeta: { ...meta(1), partialReason: 'rateLimited' } })

    expect(readSpy).toHaveBeenCalledTimes(1)
  })

  it('reads known entries again for a partial publication whose fetchedAt is 0', () => {
    const tasks = heldTasks(3)
    const pageScope = getDartReadScope(useAppStore.getState().settings)
    const own = dartAccountIdentity(pageScope, VIEWER_ID)
    cacheKnown(
      own.hostKey,
      own.accountKey,
      tasks.map((task) => task.id)
    )

    mountReads({ tasks, scopeMeta: meta(3, 0) })

    expect(readSpy).toHaveBeenCalledTimes(1)
    expect(readSpy).toHaveBeenCalledWith(
      tasks.map((task) => task.id),
      { publicationId: 3 }
    )
  })

  it('issues each overlapping publication its own first-20 reads while the first is in flight', () => {
    readSpy.mockImplementation(() => new Promise<void>(() => {}))
    const all = heldTasks(30)
    const first = all.slice(0, 25)
    const second = all.slice(5, 30)

    const hook = mountReads({ tasks: first, scopeMeta: meta(1, 0) })
    hook.rerender({ tasks: second, scopeMeta: meta(2, 0) })

    expect(readSpy).toHaveBeenCalledTimes(2)
    expect(readSpy).toHaveBeenNthCalledWith(
      1,
      first.slice(0, 20).map((task) => task.id),
      { publicationId: 1 }
    )
    expect(readSpy).toHaveBeenNthCalledWith(
      2,
      second.slice(0, 20).map((task) => task.id),
      { publicationId: 2 }
    )
  })

  it('does not read again when the same publication is remounted', () => {
    const tasks = heldTasks(3)
    mountReads({ tasks, scopeMeta: meta(1) }).unmount()

    mountReads({ tasks, scopeMeta: meta(1) })

    expect(readSpy).toHaveBeenCalledTimes(1)
  })

  it('reads a newer publication of the same scope after a remount', () => {
    const tasks = heldTasks(3)
    mountReads({ tasks, scopeMeta: meta(1) }).unmount()

    mountReads({ tasks, scopeMeta: meta(2) })

    expect(readSpy).toHaveBeenCalledTimes(2)
  })

  it('reads again when the scope is evicted and republished at the same generation and fetchedAt', () => {
    const tasks = heldTasks(2)
    const hook = mountReads({ tasks, scopeMeta: meta(1) })
    expect(readSpy).toHaveBeenCalledTimes(1)

    hook.rerender({ tasks: undefined, scopeMeta: null })
    hook.rerender({ tasks: [...tasks], scopeMeta: meta(2) })

    expect(readSpy).toHaveBeenCalledTimes(2)
    expect(readSpy).toHaveBeenLastCalledWith(
      tasks.map((task) => task.id),
      { publicationId: 2 }
    )
  })

  it('reads at most the first 20 of a publication in total while its rows grow', () => {
    const initial = heldTasks(10)
    const hook = mountReads({ tasks: initial, scopeMeta: meta(1) })
    const appended = [...initial, ...heldTasks(15, 'appended')]

    hook.rerender({ tasks: appended, scopeMeta: meta(1) })
    hook.rerender({ tasks: [...heldTasks(15, 'prepended'), ...appended], scopeMeta: meta(1) })

    expect(readSpy).toHaveBeenCalledTimes(1)
    expect(readSpy).toHaveBeenCalledWith(
      initial.map((task) => task.id),
      { publicationId: 1 }
    )
  })

  it('lets the rows that grew into the scope enter through the next publication', () => {
    const initial = heldTasks(10)
    const hook = mountReads({ tasks: initial, scopeMeta: meta(1) })
    const grown = [...heldTasks(15, 'prepended'), ...initial, ...heldTasks(15, 'appended')]
    hook.rerender({ tasks: grown, scopeMeta: meta(1) })

    hook.rerender({ tasks: grown, scopeMeta: meta(2) })

    expect(readSpy).toHaveBeenCalledTimes(2)
    expect(readSpy).toHaveBeenLastCalledWith(
      grown.slice(0, 20).map((task) => task.id),
      { publicationId: 2 }
    )
  })

  it('keeps the on-hold read marker on the scope meta', () => {
    mountReads({ tasks: heldTasks(2), scopeMeta: meta(5) })

    expect(useAppStore.getState().dartScopeMetaCache[SCOPE_KEY]?.onHoldReadPublicationId).toBe(5)
  })

  it('does not re-read a still-cached publication after more than 300 other scopes were visited', () => {
    const tasks = heldTasks(1)
    mountReads({ tasks, scopeMeta: meta(1) }).unmount()
    for (let index = 0; index < 301; index += 1) {
      mountReads({
        scopeKey: `other-${index}`,
        tasks: heldTasks(1, `other${index}-`),
        scopeMeta: meta(index + 2)
      }).unmount()
    }
    expect(readSpy).toHaveBeenCalledTimes(302)

    mountReads({ tasks, scopeMeta: meta(1) })

    expect(readSpy).toHaveBeenCalledTimes(302)
  })
})
