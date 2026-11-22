import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountFixture } from '../../test-support/rpc-recording/react-mounting/recorder-fixture-shape'
import { FakeSession } from '../../transport/connection/mobile-endpoint-supervisor-test-fakes'

const reads = vi.hoisted(() => ({ readTaskList: vi.fn() }))

vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }))
vi.mock('./use-task-list-cache', () => ({
  useTaskListCache: () => ({
    begin: () => {},
    shown: () => {},
    settle: () => {},
    rememberPageCount: () => {},
    cancelRead: () => {},
    revalidating: false,
    rowsReadAt: null
  })
}))
vi.mock('../screen-state/task-queries', () => ({
  readTaskList: reads.readTaskList,
  taskListParams: (input: { provider: string }) =>
    input.provider === 'dart' ? null : { provider: input.provider }
}))
vi.mock('../screen-state/task-query-storage', () => ({ taskListKey: () => ['task-list'] }))
vi.mock('./task-list-read', () => ({ readTaskListRows: vi.fn() }))

import { useMobileTasksTaskListLoading } from './use-mobile-tasks-task-list-loading'

const mounted: ReactTestRenderer[] = []

afterEach(() => {
  reads.readTaskList.mockReset()
  act(() => {
    for (const renderer of mounted.splice(0)) {
      renderer.unmount()
    }
  })
})

// Restored resume state or a deep link can still name a provider; assert the load never reaches another provider's read.
function mountFor(provider: 'dart' | 'linear') {
  const client = new FakeSession('connected')
  reads.readTaskList.mockResolvedValue({ items: [] })
  const setItems = vi.fn()
  const setError = vi.fn()
  const holder: { load?: () => Promise<void> } = {}

  function Probe() {
    holder.load = useMobileTasksTaskListLoading(
      mountFixture<Parameters<typeof useMobileTasksTaskListLoading>[0]>({
        appliedQuery: '',
        client,
        clientRef: { current: client },
        connState: 'connected',
        githubMode: 'items',
        hostId: 'host-1',
        jiraConnection: { connected: false, selection: null },
        effectiveRepoIds: new Set<string>(),
        selectedRepoIds: new Set<string>(),
        selectedLinearTeamIds: new Set<string>(),
        serverRepoList: [],
        linearConnected: true,
        loadGenerationRef: { current: 0 },
        provider,
        repoListEnsureLoaded: async () => [],
        resetGitHubItemsState: vi.fn(),
        setError,
        setItems,
        setLoading: vi.fn(),
        setRefreshing: vi.fn(),
        setTaskListSettled: vi.fn(),
        taskStateHydrated: true,
        tasksSupported: true
      })
    ).loadTasks
    return null
  }

  act(() => {
    mounted.push(create(createElement(Probe)))
  })
  return {
    setItems,
    setError,
    async load() {
      await act(async () => {
        if (!holder.load) {
          throw new Error('Load did not render')
        }
        await holder.load()
      })
    }
  }
}

describe('deferred provider task list loading', () => {
  it('shows the deferred notice instead of reading a list', async () => {
    const fixture = mountFor('dart')

    await fixture.load()

    expect(reads.readTaskList).not.toHaveBeenCalled()
    expect(fixture.setItems).toHaveBeenLastCalledWith([])
    expect(fixture.setError).toHaveBeenLastCalledWith(
      "This task source isn't available in Orca Mobile yet."
    )
  })

  // Proves the deferred branch short-circuits only Dart; Linear still reads its list.
  it('reads the list for a Linear provider', async () => {
    const fixture = mountFor('linear')

    await fixture.load()

    expect(reads.readTaskList).toHaveBeenCalledTimes(1)
    expect(fixture.setError).not.toHaveBeenCalledWith(
      "This task source isn't available in Orca Mobile yet."
    )
  })
})
