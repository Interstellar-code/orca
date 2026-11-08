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
import { getDartReadScope } from '@/store/slices/dart/dart-read-coordination'
import { dartAccountIdentity } from '@/store/slices/dart/dart-task-identity'
import type {
  DartBoardFeatures,
  DartClientFilters,
  DartServerFilters
} from './dart-board-contracts'
import { useDartBoardModel } from './use-dart-board-model'
import type { PinnedDartRow } from './use-dart-list-pinned-rows'

const VIEWER = { id: 'user-a', name: 'Alex Example' }
const SERVER_FILTERS: DartServerFilters = { mine: false, dartboard: null, search: '' }
const CLIENT_FILTERS: DartClientFilters = { status: null, tag: null, priority: null, onHold: false }
const FEATURES: DartBoardFeatures = { board: true, savedViews: true }
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
  overrides: { layout?: 'list' | 'board'; pinnedRows?: ReadonlyMap<string, PinnedDartRow> } = {}
) {
  return renderHook(
    (props: { pinnedRows: ReadonlyMap<string, PinnedDartRow> }) =>
      useDartBoardModel({
        scopeKey,
        pageScope: getDartReadScope(useAppStore.getState().settings),
        layout: overrides.layout ?? 'board',
        serverFilters: SERVER_FILTERS,
        clientFilters: CLIENT_FILTERS,
        showEmptyColumns: false,
        config: CONFIG,
        features: FEATURES,
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
})
