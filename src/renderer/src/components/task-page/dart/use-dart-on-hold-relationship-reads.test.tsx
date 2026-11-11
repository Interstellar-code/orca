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
import { dartAccountIdentity, dartTaskIdentityKey } from '@/store/slices/dart/dart-task-identity'
import type { DartRelationshipCacheEntry, DartScopeMeta } from './dart-board-contracts'
import { useDartOnHoldRelationshipReads } from './use-dart-on-hold-relationship-reads'

const VIEWER_ID = 'user-a'
const SCOPE_KEY = 'scope-a'
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
  installFakeDartRuntime()
  const api = window.api
  vi.stubGlobal('window', realWindow)
  Object.assign(realWindow, { api })
  readSpy = vi.fn(() => Promise.resolve())
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

  it('reads only the tasks without a known entry in this scope, up to 20', () => {
    const tasks = heldTasks(25)
    const pageScope = getDartReadScope(useAppStore.getState().settings)
    const own = dartAccountIdentity(pageScope, VIEWER_ID)
    cacheKnown(own.hostKey, own.accountKey, [tasks[0].id, tasks[1].id])

    mountReads({ tasks, scopeMeta: meta(1, 1000) })

    expect(readSpy).toHaveBeenCalledTimes(1)
    expect(readSpy).toHaveBeenCalledWith(tasks.slice(2, 22).map((task) => task.id))
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

  it('does not re-read tasks that are already known when the hook mounts on a fresh entry', () => {
    const tasks = heldTasks(3)
    const pageScope = getDartReadScope(useAppStore.getState().settings)
    const own = dartAccountIdentity(pageScope, VIEWER_ID)
    cacheKnown(
      own.hostKey,
      own.accountKey,
      tasks.map((task) => task.id)
    )

    mountReads({ tasks, scopeMeta: meta(3, 1000) })

    expect(readSpy).not.toHaveBeenCalled()
  })

  it('re-reads a known entry that was read before the publication', () => {
    const tasks = heldTasks(2)
    const pageScope = getDartReadScope(useAppStore.getState().settings)
    const own = dartAccountIdentity(pageScope, VIEWER_ID)
    cacheKnown(
      own.hostKey,
      own.accountKey,
      tasks.map((task) => task.id)
    )

    mountReads({ tasks, scopeMeta: meta(4, 9000) })

    expect(readSpy).toHaveBeenCalledWith(tasks.map((task) => task.id))
  })
})
