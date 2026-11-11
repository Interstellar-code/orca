// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DartTask, DartWorkspaceConfig } from '../../../../../shared/dart/dart-types'
import { useAppStore } from '@/store'
import {
  dartTaskFixture,
  installFakeDartRuntime,
  type FakeDartHost
} from '@/store/slices/dart/dart-fake-runtime.test-support'
import { getDartReadScope, scopedDartCacheKey } from '@/store/slices/dart/dart-read-coordination'
import { dartAccountIdentity, dartTaskIdentityKey } from '@/store/slices/dart/dart-task-identity'
import type {
  DartBoardFeatures,
  DartClientFilters,
  DartRelationshipCacheEntry,
  DartServerFilters
} from './dart-board-contracts'
import { useDartBoardModel } from './use-dart-board-model'
import { useDartNestedListModel } from './use-dart-nested-list-model'
import type { PinnedDartRow } from './use-dart-list-pinned-rows'

const VIEWER = { id: 'user-a', name: 'Alex Example' }
const SERVER_FILTERS: DartServerFilters = { mine: false, dartboard: null, search: '' }
const CLIENT_FILTERS: DartClientFilters = { status: null, tag: null, priority: null, onHold: false }
const FEATURES: DartBoardFeatures = { board: true, savedViews: true }
const RELATIONSHIPS_FEATURES: DartBoardFeatures = { ...FEATURES, relationships: true }
const CONFIG: DartWorkspaceConfig = {
  dartboards: ['Board A'],
  statuses: ['To-do', 'Doing', 'Done'],
  types: [],
  tags: [],
  priorities: [],
  sizes: [],
  assignees: []
}
const NO_PINS: ReadonlyMap<string, PinnedDartRow> = new Map()
const T0 = Date.UTC(2026, 0, 1)
const realWindow = window

let runtime: ReturnType<typeof installFakeDartRuntime>
let nextTask = 0

function taskId(label: string): string {
  return `${label}${String(nextTask).padStart(4, '0')}`
}

function openTask(label: string, status = 'To-do'): DartTask {
  return dartTaskFixture(taskId(label), {
    title: label,
    status,
    updatedAt: new Date(T0).toISOString(),
    completedAt: null
  })
}

function doneTask(index: number): DartTask {
  return dartTaskFixture(taskId(`done${index}-`), {
    title: `Done ${index}`,
    status: 'Done',
    updatedAt: new Date(T0).toISOString(),
    completedAt: new Date(T0 + (1000 - index) * 60_000).toISOString()
  })
}

function listRequests(host: FakeDartHost) {
  return host.requests.filter((request) => request.method === 'dart.listTasks')
}

/** Reads and publishes the default scope the way the page hook does, then returns what the hook needs. */
async function openScope(tasks: DartTask[]) {
  nextTask += 1
  const host = runtime.host(null)
  host.tasks.clear()
  for (const task of tasks) {
    host.addTask(task)
  }
  const settings = useAppStore.getState().settings!
  const scope = getDartReadScope(settings)
  useAppStore.setState({
    dartListCache: {},
    dartScopeMetaCache: {},
    dartMountedScopeKey: null,
    dartRelationshipCache: {},
    dartStatus: { connected: true, viewer: VIEWER },
    dartStatusChecked: true,
    dartStatusContextKey: scope.contextKey
  })
  const state = useAppStore.getState()
  const result = await state.readDartScope(SERVER_FILTERS, { features: FEATURES, scope })
  state.publishDartScope(SERVER_FILTERS, { result, current: true, scope })
  const scopeKey = useAppStore.getState().dartMountedScopeKey
  const account = dartAccountIdentity(scope, VIEWER.id)
  return { host, scopeKey, account, scope }
}

function mountModel(
  scopeKey: string | null,
  account: { hostKey: string; accountKey: string },
  overrides: {
    layout?: 'list' | 'board'
    pinnedRows?: ReadonlyMap<string, PinnedDartRow>
    clientFilters?: DartClientFilters
    features?: DartBoardFeatures
    nested?: boolean
  } = {}
) {
  return renderHook(
    (props: { pinnedRows: ReadonlyMap<string, PinnedDartRow> }) =>
      useDartBoardModel({
        scopeKey,
        pageScope: getDartReadScope(useAppStore.getState().settings),
        layout: overrides.layout ?? 'board',
        serverFilters: SERVER_FILTERS,
        clientFilters: overrides.clientFilters ?? CLIENT_FILTERS,
        showEmptyColumns: false,
        nested: overrides.nested ?? false,
        config: CONFIG,
        features: overrides.features ?? FEATURES,
        hostKey: account.hostKey,
        accountKey: account.accountKey,
        pinnedRows: props.pinnedRows,
        onOpenTask: vi.fn()
      }),
    { initialProps: { pinnedRows: overrides.pinnedRows ?? NO_PINS } }
  )
}

function columnIds(hook: ReturnType<typeof mountModel>, status: string): string[] | undefined {
  return hook.result.current.columns
    .find((column) => column.status === status)
    ?.tasks.map((task) => task.id)
}

function currentPublicationId(): number | undefined {
  const { dartMountedScopeKey, dartScopeMetaCache } = useAppStore.getState()
  return dartMountedScopeKey ? dartScopeMetaCache[dartMountedScopeKey]?.publicationId : undefined
}

/** Read in the scope's current publication unless a test says otherwise. */
function relationshipEntry(
  state: DartRelationshipCacheEntry['state'],
  blockerIds: string[] = []
): DartRelationshipCacheEntry {
  return {
    publicationId: currentPublicationId(),
    state,
    relationships:
      state === 'known'
        ? { subtaskIds: [], blockerIds, blockingIds: [], duplicateIds: [], relatedIds: [] }
        : null,
    fetchedAt: T0,
    error: null
  }
}

function cacheRelationships(
  account: { hostKey: string; accountKey: string },
  entries: Record<string, DartRelationshipCacheEntry>
): void {
  useAppStore.setState({
    dartRelationshipCache: Object.fromEntries(
      Object.entries(entries).map(([taskId, entry]) => [
        dartTaskIdentityKey({ ...account, taskId }),
        entry
      ])
    )
  })
}

beforeEach(() => {
  runtime = installFakeDartRuntime()
  // The fake stubs a bare `window`, which React DOM cannot render into, so its API moves onto the real one.
  const api = window.api
  vi.stubGlobal('window', realWindow)
  Object.assign(realWindow, { api })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('useDartBoardModel', () => {
  it('moves a card to the new column on a patch with no read', async () => {
    const task = openTask('patch')
    const { host, scopeKey, account } = await openScope([task])
    const hook = mountModel(scopeKey, account)
    expect(columnIds(hook, 'To-do')).toEqual([task.id])
    const reads = listRequests(host).length

    act(() =>
      useAppStore.getState().patchDartTask({ ...account, taskId: task.id }, { status: 'Doing' })
    )

    expect(columnIds(hook, 'Doing')).toEqual([task.id])
    expect(columnIds(hook, 'To-do')).toBeUndefined()
    expect(listRequests(host)).toHaveLength(reads)
  })

  it('builds columns from store rows and adds pinned rows without touching the store', async () => {
    const stored = openTask('stored')
    const pinned = openTask('pinned', 'Doing')
    const { scopeKey, account } = await openScope([stored])
    const storedRows = useAppStore.getState().dartListCache[scopeKey!]?.data?.tasks
    const hook = mountModel(scopeKey, account)
    expect(columnIds(hook, 'Doing')).toBeUndefined()

    hook.rerender({ pinnedRows: new Map([[pinned.id, { row: pinned, survivesNextClear: false }]]) })

    expect(columnIds(hook, 'Doing')).toEqual([pinned.id])
    expect(hook.result.current.cardInfo(pinned.id).task).toMatchObject({ id: pinned.id })
    expect(useAppStore.getState().dartListCache[scopeKey!]?.data?.tasks).toBe(storedRows)
  })

  it('keeps a pinned row on the board after it stops matching a client filter, also while the store still holds it, until its pin is gone', async () => {
    const stored = openTask('stored', 'Doing')
    const moved = openTask('moved', 'Doing')
    const { scopeKey, account } = await openScope([stored])
    const pinnedRows = new Map([[moved.id, { row: moved, survivesNextClear: false }]])
    const clientFilters = { ...CLIENT_FILTERS, status: 'To-do' }
    const hook = mountModel(scopeKey, account, { pinnedRows, clientFilters })

    expect(columnIds(hook, 'Doing')).toEqual([moved.id])
    expect(columnIds(hook, 'To-do')).toBeUndefined()

    hook.rerender({ pinnedRows: new Map([[stored.id, { row: stored, survivesNextClear: false }]]) })
    expect(columnIds(hook, 'Doing')).toEqual([stored.id])

    hook.rerender({ pinnedRows: NO_PINS })
    expect(hook.result.current.columns).toEqual([])
  })

  it('builds no columns in list layout but still offers more finished tasks', async () => {
    const { scopeKey, account } = await openScope([
      openTask('list'),
      ...Array.from({ length: 60 }, (_, index) => doneTask(index))
    ])
    const hook = mountModel(scopeKey, account, { layout: 'list' })

    expect(hook.result.current.columns).toEqual([])
    expect(hook.result.current.hasMoreDone).toBe(true)
  })

  describe('onMove', () => {
    it('moves the card at once, sends one status update and settles on the reply', async () => {
      const task = openTask('move')
      const { host, scopeKey, account } = await openScope([task])
      const hook = mountModel(scopeKey, account)
      const release = host.hold('dart.updateTask')

      let moved: ReturnType<typeof hook.result.current.onMove> | undefined
      act(() => {
        moved = hook.result.current.onMove(task, 'Doing')
      })

      expect(columnIds(hook, 'Doing')).toEqual([task.id])
      release()
      await act(async () => {
        await moved
      })
      expect(await moved).toMatchObject({ ok: true })
      expect(host.requests.filter((request) => request.method === 'dart.updateTask')).toEqual([
        expect.objectContaining({
          params: expect.objectContaining({ taskId: task.id, updates: { status: 'Doing' } })
        })
      ])
      expect(host.tasks.get(task.id)?.status).toBe('Doing')
    })

    it('puts the card back when Dart refuses the move', async () => {
      const task = openTask('refused')
      const { host, scopeKey, account } = await openScope([task])
      const hook = mountModel(scopeKey, account)
      host.refusals.push({
        ok: false,
        error: 'Bad value',
        errorCode: 'dart.badRequest',
        outcome: 'notApplied'
      })

      let result: Awaited<ReturnType<typeof hook.result.current.onMove>> | undefined
      await act(async () => {
        result = await hook.result.current.onMove(task, 'Doing')
      })

      expect(result).toMatchObject({ ok: false, outcome: 'notApplied' })
      expect(columnIds(hook, 'To-do')).toEqual([task.id])
      expect(columnIds(hook, 'Doing')).toBeUndefined()
    })

    it('sends a queued move to the host it was dropped on after the page switches hosts', async () => {
      const task = openTask('switch')
      const { host, scopeKey, account } = await openScope([task])
      const otherHost = runtime.host('move-switch-remote')
      otherHost.addTask({ ...task, status: 'To-do' })
      const hook = mountModel(scopeKey, account)
      const localSettings = useAppStore.getState().settings!

      let moved: ReturnType<typeof hook.result.current.onMove> | undefined
      act(() => {
        moved = hook.result.current.onMove(task, 'Doing')
        useAppStore.setState({
          settings: { ...localSettings, activeRuntimeEnvironmentId: 'move-switch-remote' }
        })
      })
      await act(async () => {
        await moved
      })
      useAppStore.setState({ settings: localSettings })

      expect(await moved).toMatchObject({ ok: true })
      expect(host.count('dart.updateTask')).toBe(1)
      expect(otherHost.requests).toEqual([])
      expect(useAppStore.getState().dartListCache[scopeKey!]?.data?.tasks[0]?.status).toBe('Doing')
    })

    it('sends nothing for a drop on the task’s own status', async () => {
      const task = openTask('same')
      const { host, scopeKey, account } = await openScope([task])
      const hook = mountModel(scopeKey, account)

      const result = await hook.result.current.onMove(task, 'to-do')

      expect(result).toMatchObject({ ok: true })
      expect(host.count('dart.updateTask')).toBe(0)
    })
  })

  describe('showMoreDone', () => {
    it('reads once while loading and appends the finished rows', async () => {
      const { host, scopeKey, account } = await openScope([
        openTask('more'),
        ...Array.from({ length: 60 }, (_, index) => doneTask(index))
      ])
      const hook = mountModel(scopeKey, account)
      expect(hook.result.current.hasMoreDone).toBe(true)
      expect(columnIds(hook, 'Done')).toHaveLength(50)
      const release = host.hold('dart.listTasks')

      act(() => hook.result.current.showMoreDone())
      act(() => hook.result.current.showMoreDone())

      await waitFor(() => expect(hook.result.current.doneMore.state).toBe('loading'))
      const finishedReads = listRequests(host).filter((request) => request.params.isCompleted)
      expect(finishedReads).toHaveLength(2)
      expect(finishedReads[1].params.offset).toBe(50)
      release()

      await waitFor(() => expect(hook.result.current.doneMore.state).toBe('ready'))
      expect(columnIds(hook, 'Done')).toHaveLength(60)
      expect(hook.result.current.hasMoreDone).toBe(false)
      expect(listRequests(host).filter((request) => request.params.isCompleted)).toHaveLength(2)
    })

    it('reports a failed read and retries it', async () => {
      const { host, scopeKey, account } = await openScope(
        Array.from({ length: 60 }, (_, index) => doneTask(index))
      )
      const hook = mountModel(scopeKey, account)
      host.failListRequest(listRequests(host).length + 1)

      act(() => hook.result.current.showMoreDone())
      await waitFor(() => expect(hook.result.current.doneMore.state).toBe('error'))
      expect(hook.result.current.doneMore.error).toBeTruthy()

      act(() => hook.result.current.doneMore.retry())
      await waitFor(() => expect(hook.result.current.doneMore.state).toBe('ready'))
      expect(hook.result.current.hasMoreDone).toBe(false)
    })
  })

  describe('relationships', () => {
    it('marks an on-hold card without data as not checked and counts blockers from a known entry', async () => {
      const unread = openTask('unread', 'On Hold')
      const blocked = openTask('blocked', 'On Hold')
      const plain = openTask('plain')
      const { scopeKey, account } = await openScope([unread, blocked, plain])
      cacheRelationships(account, { [blocked.id]: relationshipEntry('known', ['b1', 'b2']) })
      const hook = mountModel(scopeKey, account, { features: RELATIONSHIPS_FEATURES })

      expect(hook.result.current.cardInfo(unread.id)).toMatchObject({
        relationshipState: 'notChecked',
        blockedBy: null
      })
      expect(hook.result.current.cardInfo(blocked.id)).toMatchObject({
        relationshipState: 'known',
        blockedBy: 2,
        blocking: 0
      })
      expect(hook.result.current.cardInfo(plain.id)).not.toHaveProperty('relationshipState')
    })

    it('keeps blocked and not-checked on-hold tasks under the blocked-on-hold filter and drops known-unblocked ones', async () => {
      const blocked = openTask('blocked', 'On Hold')
      const unblocked = openTask('unblocked', 'On Hold')
      const unread = openTask('unread', 'On Hold')
      const plain = openTask('plain')
      const { scopeKey, account } = await openScope([blocked, unblocked, unread, plain])
      cacheRelationships(account, {
        [blocked.id]: relationshipEntry('known', ['b1']),
        [unblocked.id]: relationshipEntry('known')
      })
      const clientFilters = { ...CLIENT_FILTERS, blockedOnHold: true }
      const hook = mountModel(scopeKey, account, {
        features: RELATIONSHIPS_FEATURES,
        clientFilters
      })

      expect(columnIds(hook, 'On Hold')).toEqual([blocked.id, unread.id])
      expect(columnIds(hook, 'To-do')).toBeUndefined()

      act(() =>
        cacheRelationships(account, {
          [blocked.id]: relationshipEntry('known', ['b1']),
          [unblocked.id]: relationshipEntry('known'),
          [unread.id]: relationshipEntry('known')
        })
      )
      expect(columnIds(hook, 'On Hold')).toEqual([blocked.id])
    })

    it('treats a known entry from another or no publication as not checked, and one from the current publication as known', async () => {
      const current = openTask('current', 'On Hold')
      const older = openTask('older', 'On Hold')
      const unstamped = openTask('unstamped', 'On Hold')
      const { scopeKey, account } = await openScope([current, older, unstamped])
      const publicationId = currentPublicationId()!
      cacheRelationships(account, {
        [current.id]: relationshipEntry('known', ['b1']),
        [older.id]: { ...relationshipEntry('known', ['b1']), publicationId: publicationId - 1 },
        [unstamped.id]: { ...relationshipEntry('known', ['b1']), publicationId: undefined }
      })
      const hook = mountModel(scopeKey, account, { features: RELATIONSHIPS_FEATURES })

      expect(hook.result.current.cardInfo(current.id)).toMatchObject({
        relationshipState: 'known',
        blockedBy: 1
      })
      for (const task of [older, unstamped]) {
        expect(hook.result.current.cardInfo(task.id)).toMatchObject({
          relationshipState: 'notChecked',
          blockedBy: null
        })
      }
      expect(hook.result.current.notChecked).toBe(2)
    })

    it('keeps an older-publication known on-hold task under the blocked-on-hold filter and drops a current known-unblocked one', async () => {
      const older = openTask('older', 'On Hold')
      const unblocked = openTask('unblocked', 'On Hold')
      const { scopeKey, account } = await openScope([older, unblocked])
      cacheRelationships(account, {
        [older.id]: { ...relationshipEntry('known'), publicationId: currentPublicationId()! - 1 },
        [unblocked.id]: relationshipEntry('known')
      })
      const hook = mountModel(scopeKey, account, {
        features: RELATIONSHIPS_FEATURES,
        clientFilters: { ...CLIENT_FILTERS, blockedOnHold: true }
      })

      expect(columnIds(hook, 'On Hold')).toEqual([older.id])
    })

    it('renders exactly as release A on a host without relationships', async () => {
      const onHold = openTask('hold', 'On Hold')
      const { scopeKey, account } = await openScope([onHold])
      cacheRelationships(account, { [onHold.id]: relationshipEntry('known', ['b1']) })
      const hook = mountModel(scopeKey, account)

      expect(hook.result.current.cardInfo(onHold.id)).toEqual({ task: onHold, onHold: true })
      expect(hook.result.current).not.toHaveProperty('notChecked')
      expect(hook.result.current.checkMore).toBeUndefined()
    })

    it('leaves subtasks out of the columns when nested and counts the loaded ones on the parent', async () => {
      const parent = openTask('parent')
      const child = { ...openTask('child'), parentId: parent.id }
      const { scopeKey, account } = await openScope([parent, child])
      const nested = mountModel(scopeKey, account, {
        features: RELATIONSHIPS_FEATURES,
        nested: true
      })

      expect(columnIds(nested, 'To-do')).toEqual([parent.id])
      expect(nested.result.current.cardInfo(parent.id).subtasks).toEqual({
        loaded: 1,
        total: null
      })

      const flat = mountModel(scopeKey, account, { features: RELATIONSHIPS_FEATURES })
      expect(columnIds(flat, 'To-do')).toEqual([parent.id, child.id])
      expect(flat.result.current.cardInfo(parent.id).subtasks).toBeUndefined()
    })

    it('adds a stored children entry to the parent count without double counting scope rows', async () => {
      const parent = openTask('parent')
      const inScope = { ...openTask('inscope'), parentId: parent.id }
      const onlyStored = { ...openTask('stored'), parentId: parent.id }
      const { scopeKey, account, scope } = await openScope([parent, inScope])
      const childrenKey = scopedDartCacheKey(scope, `list::children::${parent.id}`)
      useAppStore.setState((state) => ({
        dartListCache: {
          ...state.dartListCache,
          [childrenKey]: { data: { tasks: [inScope, onlyStored], totalCount: 2 }, fetchedAt: T0 }
        }
      }))
      const hook = mountModel(scopeKey, account, { features: RELATIONSHIPS_FEATURES, nested: true })

      expect(hook.result.current.cardInfo(parent.id).subtasks).toEqual({ loaded: 2, total: null })
    })

    it('counts a cached child under the parent a newer scope row moved it to', async () => {
      const oldParent = openTask('oldparent')
      const newParent = openTask('newparent')
      const moved = {
        ...openTask('moved'),
        parentId: newParent.id,
        updatedAt: '2026-11-10T00:00:00.000Z'
      }
      const cachedCopy = { ...moved, parentId: oldParent.id, updatedAt: '2026-11-01T00:00:00.000Z' }
      const { scopeKey, account, scope } = await openScope([oldParent, newParent, moved])
      const childrenKey = scopedDartCacheKey(scope, `list::children::${oldParent.id}`)
      useAppStore.setState((state) => ({
        dartListCache: {
          ...state.dartListCache,
          [childrenKey]: { data: { tasks: [cachedCopy], totalCount: 1 }, fetchedAt: T0 }
        }
      }))
      const hook = mountModel(scopeKey, account, { features: RELATIONSHIPS_FEATURES, nested: true })

      expect(hook.result.current.cardInfo(oldParent.id).subtasks?.loaded ?? 0).toBe(0)
      expect(hook.result.current.cardInfo(newParent.id).subtasks?.loaded).toBe(1)
    })

    it('counts a child under the parent whose newer cache entry holds it, not the older entry’s parent', async () => {
      const parentA = openTask('parenta')
      const parentB = openTask('parentb')
      const olderCopy = {
        ...openTask('moved'),
        parentId: parentA.id,
        updatedAt: '2026-11-01T00:00:00.000Z'
      }
      const newerCopy = {
        ...olderCopy,
        parentId: parentB.id,
        updatedAt: '2026-11-10T00:00:00.000Z'
      }
      const { scopeKey, account, scope } = await openScope([parentA, parentB])
      useAppStore.setState((state) => ({
        dartListCache: {
          ...state.dartListCache,
          [scopedDartCacheKey(scope, `list::children::${parentA.id}`)]: {
            data: { tasks: [olderCopy], totalCount: 1 },
            fetchedAt: T0
          },
          [scopedDartCacheKey(scope, `list::children::${parentB.id}`)]: {
            data: { tasks: [newerCopy], totalCount: 1 },
            fetchedAt: T0
          }
        }
      }))
      const hook = mountModel(scopeKey, account, { features: RELATIONSHIPS_FEATURES, nested: true })

      expect(hook.result.current.cardInfo(parentA.id).subtasks?.loaded ?? 0).toBe(0)
      expect(hook.result.current.cardInfo(parentB.id).subtasks?.loaded).toBe(1)
    })

    it('keeps a scope task out of the cards when its newer copy under an unlisted parent is cached, and agrees with the nested list', async () => {
      const listed = openTask('listed')
      const other = openTask('other')
      const movedCopy = {
        ...listed,
        parentId: 'unlisted000001',
        updatedAt: '2026-11-10T00:00:00.000Z'
      }
      const { scopeKey, account, scope } = await openScope([listed, other])
      useAppStore.setState((state) => ({
        dartListCache: {
          ...state.dartListCache,
          [scopedDartCacheKey(scope, 'list::children::unlisted000001')]: {
            data: { tasks: [movedCopy], totalCount: 1 },
            fetchedAt: T0
          }
        }
      }))
      const board = mountModel(scopeKey, account, {
        features: RELATIONSHIPS_FEATURES,
        nested: true
      })
      const list = renderHook(() =>
        useDartNestedListModel({
          tasks: [listed, other],
          nested: true,
          pageScope: scope,
          hostKey: account.hostKey,
          accountKey: account.accountKey,
          viewerId: VIEWER.id,
          relationshipsHost: true
        })
      )

      expect(columnIds(board, 'To-do')).toEqual([other.id])
      expect(
        list.result.current.rows.filter((row) => row.depth === 0).map((row) => row.task.id)
      ).toEqual([other.id])
    })

    it('counts a scope task a newer cached copy reparented once, under the new parent only', async () => {
      const oldParent = openTask('oldparent')
      const newParent = openTask('newparent')
      const moved = openTask('moved')
      const newerCopy = {
        ...moved,
        parentId: newParent.id,
        updatedAt: '2026-11-10T00:00:00.000Z'
      }
      const { scopeKey, account, scope } = await openScope([oldParent, newParent, moved])
      useAppStore.setState((state) => ({
        dartListCache: {
          ...state.dartListCache,
          [scopedDartCacheKey(scope, `list::children::${newParent.id}`)]: {
            data: { tasks: [newerCopy], totalCount: 1 },
            fetchedAt: T0
          }
        }
      }))
      const hook = mountModel(scopeKey, account, { features: RELATIONSHIPS_FEATURES, nested: true })

      expect(columnIds(hook, 'To-do')).toEqual([oldParent.id, newParent.id])
      expect(hook.result.current.cardInfo(oldParent.id).subtasks?.loaded ?? 0).toBe(0)
      expect(hook.result.current.cardInfo(newParent.id).subtasks?.loaded).toBe(1)
    })

    it('keeps a stale parentless pinned row out of the cards when its newer cached copy has a listed parent', async () => {
      const parent = openTask('parent')
      const stalePin = openTask('pinned')
      const newerCopy = { ...stalePin, parentId: parent.id, updatedAt: '2026-11-10T00:00:00.000Z' }
      const { scopeKey, account, scope } = await openScope([parent])
      useAppStore.setState((state) => ({
        dartListCache: {
          ...state.dartListCache,
          [scopedDartCacheKey(scope, `list::children::${parent.id}`)]: {
            data: { tasks: [newerCopy], totalCount: 1 },
            fetchedAt: T0
          }
        }
      }))
      const pinnedRows = new Map([[stalePin.id, { row: stalePin, survivesNextClear: false }]])
      const hook = mountModel(scopeKey, account, {
        features: RELATIONSHIPS_FEATURES,
        nested: true,
        pinnedRows
      })

      expect(columnIds(hook, 'To-do')).toEqual([parent.id])
      expect(hook.result.current.cardInfo(parent.id).subtasks?.loaded).toBe(1)
    })

    it('checks the next 20 not-checked on-hold tasks in read order', async () => {
      const held = Array.from({ length: 25 }, (_, index) =>
        openTask(`held${String(index).padStart(2, '0')}-`, 'On Hold')
      )
      const { scopeKey, account } = await openScope([openTask('plain'), ...held])
      cacheRelationships(account, { [held[0].id]: relationshipEntry('known') })
      const readSpy = vi.fn(() => Promise.resolve())
      useAppStore.setState({ readDartOnHoldRelationships: readSpy })
      const hook = mountModel(scopeKey, account, { features: RELATIONSHIPS_FEATURES })

      expect(hook.result.current.notChecked).toBe(24)
      act(() => hook.result.current.checkMore?.())
      expect(readSpy).toHaveBeenLastCalledWith(
        held.slice(1, 21).map((task) => task.id),
        { publicationId: currentPublicationId() }
      )

      act(() =>
        cacheRelationships(
          account,
          Object.fromEntries(held.slice(0, 21).map((task) => [task.id, relationshipEntry('known')]))
        )
      )
      expect(hook.result.current.notChecked).toBe(4)
      act(() => hook.result.current.checkMore?.())
      expect(readSpy).toHaveBeenLastCalledWith(
        held.slice(21).map((task) => task.id),
        { publicationId: currentPublicationId() }
      )
    })

    describe('checkMore after failed reads', () => {
      async function openHeldScope(heldCount: number, failingCount: number) {
        const held = Array.from({ length: heldCount }, (_, index) =>
          openTask(`held${String(index).padStart(2, '0')}-`, 'On Hold')
        )
        const failing = new Set(held.slice(0, failingCount).map((task) => task.id))
        const { scopeKey, account } = await openScope(held)
        const readSpy = vi.fn((ids: readonly string[]) => {
          const next = Object.fromEntries(
            ids.map((id) => [
              dartTaskIdentityKey({ ...account, taskId: id }),
              relationshipEntry(failing.has(id) ? 'error' : 'known')
            ])
          )
          useAppStore.setState((state) => ({
            dartRelationshipCache: { ...state.dartRelationshipCache, ...next }
          }))
          return Promise.resolve()
        })
        useAppStore.setState({ readDartOnHoldRelationships: readSpy })
        const hook = mountModel(scopeKey, account, { features: RELATIONSHIPS_FEATURES })
        return { held, readSpy, hook }
      }

      it('reads tasks not yet attempted before retrying failed ones', async () => {
        const { held, readSpy, hook } = await openHeldScope(28, 3)

        act(() => hook.result.current.checkMore?.())
        expect(readSpy).toHaveBeenLastCalledWith(
          held.slice(0, 20).map((task) => task.id),
          { publicationId: currentPublicationId() }
        )
        expect(hook.result.current.notChecked).toBe(3 + 8)

        act(() => hook.result.current.checkMore?.())
        expect(readSpy).toHaveBeenLastCalledWith(
          [...held.slice(20), ...held.slice(0, 3)].map((task) => task.id),
          { publicationId: currentPublicationId() }
        )
      })

      it('reaches later tasks when more than a batch of earlier reads keep failing', async () => {
        const { held, readSpy, hook } = await openHeldScope(27, 22)

        act(() => hook.result.current.checkMore?.())
        act(() => hook.result.current.checkMore?.())

        expect(readSpy).toHaveBeenLastCalledWith(
          [...held.slice(20), ...held.slice(0, 13)].map((task) => task.id),
          { publicationId: currentPublicationId() }
        )
        expect(hook.result.current.notChecked).toBe(22)
      })
    })
  })
})
