// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import { dartTaskFixture } from '@/store/slices/dart/dart-fake-runtime.test-support'
import type { DartClientFilters } from './dart-board-contracts'
import { dartTaskIdentityKey } from '@/store/slices/dart/dart-task-identity'
import { useDartDisplayedTasks } from './use-dart-displayed-tasks'

const NO_FILTERS: DartClientFilters = { status: null, tag: null, priority: null, onHold: false }
const ACCOUNT = { hostKey: 'displayed-host', accountKey: 'user-a' }

function displayed(args: {
  base: ReturnType<typeof dartTaskFixture>[]
  pinned: ReturnType<typeof dartTaskFixture>[]
  clientFilters: DartClientFilters
  relationshipsHost?: boolean
}) {
  return renderHook(() =>
    useDartDisplayedTasks({
      boardPath: true,
      hasWorkspace: false,
      layout: 'list',
      baseTasks: args.base,
      localTotal: 0,
      scopeMeta: null,
      pinnedRows: new Map(args.pinned.map((row) => [row.id, { row, survivesNextClear: false }])),
      ...ACCOUNT,
      search: '',
      clientFilters: args.clientFilters,
      relationshipsHost: args.relationshipsHost ?? false
    })
  ).result.current
}

describe('useDartDisplayedTasks pinned rows and client filters', () => {
  it('keeps a pinned row that fails the client filter and filters the read rows', () => {
    const matching = dartTaskFixture('matching', { status: 'To-do' })
    const filteredOut = dartTaskFixture('filteredOut', { status: 'Doing' })
    const moved = dartTaskFixture('moved', { status: 'Doing' })

    const result = displayed({
      base: [matching, filteredOut],
      pinned: [moved],
      clientFilters: { ...NO_FILTERS, status: 'To-do' }
    })

    expect(result.tasks.map((row) => row.id).sort()).toEqual(['matching', 'moved'])
    expect(result.loadedCount).toBe(3)
  })

  it('keeps an edited row listed while the patched store row still holds it, though it no longer matches the client filter', () => {
    const edited = dartTaskFixture('edited', { status: 'Doing' })

    const result = displayed({
      base: [edited],
      pinned: [edited],
      clientFilters: { ...NO_FILTERS, status: 'To-do' }
    })

    expect(result.tasks).toEqual([expect.objectContaining({ id: 'edited', status: 'Doing' })])
    expect(result.loadedCount).toBe(1)
  })

  it('filters the read row like any other once its pin is gone after a refresh', () => {
    const returned = dartTaskFixture('returned', { status: 'Doing' })

    const result = displayed({
      base: [returned],
      pinned: [],
      clientFilters: { ...NO_FILTERS, status: 'To-do' }
    })

    expect(result.tasks).toEqual([])
  })
})

describe('useDartDisplayedTasks blocked on-hold filter', () => {
  const BLOCKED_ONLY: DartClientFilters = { ...NO_FILTERS, blockedOnHold: true }
  const entry = (blockerIds: string[]) => ({
    state: 'known' as const,
    relationships: {
      subtaskIds: [],
      blockerIds,
      blockingIds: [],
      duplicateIds: [],
      relatedIds: []
    },
    fetchedAt: 1,
    error: null
  })
  const key = (taskId: string): string => dartTaskIdentityKey({ ...ACCOUNT, taskId })

  afterEach(() => {
    useAppStore.setState({ dartRelationshipCache: {} })
  })

  it('drops known-unblocked on-hold rows and keeps blocked and not-checked ones on a relationships host', () => {
    useAppStore.setState({
      dartRelationshipCache: { [key('free')]: entry([]), [key('stuck')]: entry(['other']) }
    })
    const base = ['free', 'stuck', 'unread'].map((id) => dartTaskFixture(id, { status: 'On Hold' }))

    const result = displayed({
      base,
      pinned: [],
      clientFilters: BLOCKED_ONLY,
      relationshipsHost: true
    })

    expect(result.tasks.map((row) => row.id).sort()).toEqual(['stuck', 'unread'])
  })

  it('keeps every on-hold row when the host has no relationships', () => {
    useAppStore.setState({ dartRelationshipCache: { [key('free')]: entry([]) } })

    const result = displayed({
      base: [dartTaskFixture('free', { status: 'On Hold' })],
      pinned: [],
      clientFilters: BLOCKED_ONLY
    })

    expect(result.tasks.map((row) => row.id)).toEqual(['free'])
  })
})
