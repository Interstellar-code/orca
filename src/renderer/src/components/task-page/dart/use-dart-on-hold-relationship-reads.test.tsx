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
import {
  dartOnHoldPublicationId,
  useDartOnHoldRelationshipReads
} from './use-dart-on-hold-relationship-reads'

const VIEWER_ID = 'user-a'
let scopeKeyCounter = 0
let SCOPE_KEY = 'scope-a'
const realWindow = window

function meta(generation: number, fetchedAt: number): DartScopeMeta {
  return {
    fetchedAt,
    openTotal: 0,
    doneTotal: 0,
    doneOffset: 0,
    generation,
    incomplete: fetchedAt === 0,
    partialReason: null
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

function mountReads(initial: HookProps) {
  const pageScope = getDartReadScope(useAppStore.getState().settings)
  return renderHook(
    (props: HookProps) =>
      useDartOnHoldRelationshipReads({
        active: true,
        scopeKey: props.scopeKey === undefined ? SCOPE_KEY : props.scopeKey,
        scopeEntryTasks: props.tasks,
        scopeMeta: props.scopeMeta,
        pageScope,
        viewerId: VIEWER_ID
      }),
    { initialProps: initial }
  )
}

let readSpy: ReturnType<typeof vi.fn<(taskIds: readonly string[]) => Promise<void>>>

beforeEach(() => {
  // The attempted record is module-level, so each test needs its own scope.
  scopeKeyCounter += 1
  SCOPE_KEY = `scope-${scopeKeyCounter}`
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
  useAppStore.setState({ dartRelationshipCache: {}, readDartOnHoldRelationships: readSpy })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('useDartOnHoldRelationshipReads', () => {
  it('reads on a partial first publication whose fetchedAt is 0', () => {
    const tasks = heldTasks(2)

    mountReads({ tasks, scopeMeta: meta(1, 0) })

    expect(readSpy).toHaveBeenCalledWith(tasks.map((task) => task.id))
  })

  it('ignores known entries that belong to another host or account', () => {
    const tasks = heldTasks(2)
    const pageScope = getDartReadScope(useAppStore.getState().settings)
    const own = dartAccountIdentity(pageScope, VIEWER_ID)
    cacheKnown('runtime:other-host', own.accountKey, [tasks[0].id, tasks[1].id])

    mountReads({ tasks, scopeMeta: meta(1, 1000) })

    expect(readSpy).toHaveBeenCalledWith(tasks.map((task) => task.id))
  })

  it('reads the first 20 on-hold tasks of the read set even when some are already known', () => {
    const tasks = heldTasks(25)
    const pageScope = getDartReadScope(useAppStore.getState().settings)
    const own = dartAccountIdentity(pageScope, VIEWER_ID)
    cacheKnown(own.hostKey, own.accountKey, [tasks[0].id, tasks[1].id])

    mountReads({ tasks, scopeMeta: meta(1, 1000) })

    expect(readSpy).toHaveBeenCalledTimes(1)
    expect(readSpy).toHaveBeenCalledWith(tasks.slice(0, 20).map((task) => task.id))
  })

  it('reads again for a second publication with the same fetchedAt', () => {
    const first = heldTasks(1, 'first')
    const hook = mountReads({ tasks: first, scopeMeta: meta(1, 1000) })
    expect(readSpy).toHaveBeenCalledTimes(1)

    const second = heldTasks(1, 'second')
    hook.rerender({ tasks: second, scopeMeta: meta(2, 1000) })

    expect(readSpy).toHaveBeenCalledTimes(2)
    expect(readSpy).toHaveBeenLastCalledWith([second[0].id])
  })

  it('does not read again for the same publication when rows are re-selected', () => {
    const tasks = heldTasks(2)
    const hook = mountReads({ tasks, scopeMeta: meta(1, 1000) })

    hook.rerender({ tasks: [...tasks], scopeMeta: meta(1, 1000) })

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
    expect(readSpy).toHaveBeenCalledWith(tasks.map((task) => task.id))
  })

  it('issues each overlapping publication its own first-20 reads while the first is in flight', () => {
    readSpy.mockImplementation(() => new Promise<void>(() => {}))
    const all = heldTasks(30)
    const first = all.slice(0, 25)
    const second = all.slice(5, 30)
    const pageScope = getDartReadScope(useAppStore.getState().settings)
    const own = dartAccountIdentity(pageScope, VIEWER_ID)
    cacheKnown(
      own.hostKey,
      own.accountKey,
      all.map((task) => task.id)
    )

    const hook = mountReads({ tasks: first, scopeMeta: meta(1, 0) })
    hook.rerender({ tasks: second, scopeMeta: meta(2, 0) })

    expect(readSpy).toHaveBeenCalledTimes(2)
    expect(readSpy).toHaveBeenNthCalledWith(
      1,
      first.slice(0, 20).map((task) => task.id)
    )
    expect(readSpy).toHaveBeenNthCalledWith(
      2,
      second.slice(0, 20).map((task) => task.id)
    )
  })

  it('does not read the rest of the on-hold tasks when the same publication is re-selected', () => {
    const tasks = heldTasks(45)
    const hook = mountReads({ tasks, scopeMeta: meta(1, 1000) })

    hook.rerender({ tasks: [...tasks], scopeMeta: meta(1, 1000) })

    expect(readSpy).toHaveBeenCalledTimes(1)
  })

  it('does not re-read an attempted publication after the hook remounts', () => {
    const tasks = heldTasks(3)
    mountReads({ tasks, scopeMeta: meta(1, 1000) }).unmount()

    mountReads({ tasks, scopeMeta: meta(1, 1000) })

    expect(readSpy).toHaveBeenCalledTimes(1)
  })

  it('reads a newer publication of the same scope after a remount', () => {
    const tasks = heldTasks(3)
    mountReads({ tasks, scopeMeta: meta(1, 1000) }).unmount()

    mountReads({ tasks, scopeMeta: meta(2, 1000) })

    expect(readSpy).toHaveBeenCalledTimes(2)
  })

  it('reads again when the store was emptied and restarts at the same generation', () => {
    const tasks = heldTasks(2)
    const hook = mountReads({ tasks, scopeMeta: meta(1, 1000) })
    expect(readSpy).toHaveBeenCalledTimes(1)

    useAppStore.setState({ dartRelationshipCache: {} })
    hook.rerender({ tasks: [...tasks], scopeMeta: meta(1, 2000) })

    expect(readSpy).toHaveBeenCalledTimes(2)
  })

  it('reads again when the scope is evicted and republished at the same generation and fetchedAt', () => {
    const tasks = heldTasks(2)
    const hook = mountReads({ tasks, scopeMeta: meta(1, 1000) })
    expect(readSpy).toHaveBeenCalledTimes(1)

    hook.rerender({ tasks: undefined, scopeMeta: null })
    hook.rerender({ tasks: [...tasks], scopeMeta: meta(1, 1000) })

    expect(readSpy).toHaveBeenCalledTimes(2)
    expect(readSpy).toHaveBeenLastCalledWith(tasks.map((task) => task.id))
  })

  it('reads again for a republished generation 1 while the relationship entries are still cached', () => {
    const tasks = heldTasks(2)
    const hook = mountReads({ tasks, scopeMeta: meta(1, 1000) })

    hook.rerender({ tasks: [...tasks], scopeMeta: meta(1, 2000) })

    expect(readSpy).toHaveBeenCalledTimes(2)
  })

  it('reads again on a remount that never saw the evicted publication', () => {
    const tasks = heldTasks(2)
    mountReads({ tasks, scopeMeta: meta(1, 1000) }).unmount()

    mountReads({ tasks, scopeMeta: meta(1, 2000) })

    expect(readSpy).toHaveBeenCalledTimes(2)
  })

  it('reads at most the first 20 of a publication in total while its rows grow', () => {
    const initial = heldTasks(10)
    const hook = mountReads({ tasks: initial, scopeMeta: meta(1, 1000) })
    const appended = [...initial, ...heldTasks(15, 'appended')]

    hook.rerender({ tasks: appended, scopeMeta: meta(1, 1000) })
    hook.rerender({ tasks: [...heldTasks(15, 'prepended'), ...appended], scopeMeta: meta(1, 1000) })

    expect(readSpy).toHaveBeenCalledTimes(1)
    expect(readSpy).toHaveBeenCalledWith(initial.map((task) => task.id))
  })

  it('lets the rows that grew into the scope enter through the next publication', () => {
    const initial = heldTasks(10)
    const hook = mountReads({ tasks: initial, scopeMeta: meta(1, 1000) })
    const grown = [...heldTasks(15, 'prepended'), ...initial, ...heldTasks(15, 'appended')]
    hook.rerender({ tasks: grown, scopeMeta: meta(1, 1000) })

    hook.rerender({ tasks: grown, scopeMeta: meta(2, 2000) })

    expect(readSpy).toHaveBeenCalledTimes(2)
    expect(readSpy).toHaveBeenLastCalledWith(grown.slice(0, 20).map((task) => task.id))
  })

  it('keeps one publication id across meta copies and issues a new one per generation', () => {
    const tasks = heldTasks(2)
    const first = dartOnHoldPublicationId(SCOPE_KEY, meta(1, 1000), tasks)

    expect(dartOnHoldPublicationId(SCOPE_KEY, { ...meta(1, 1000), openTotal: 5 }, tasks)).toBe(
      first
    )
    expect(dartOnHoldPublicationId(SCOPE_KEY, meta(2, 1000), tasks)).toBeGreaterThan(first)
  })
})
