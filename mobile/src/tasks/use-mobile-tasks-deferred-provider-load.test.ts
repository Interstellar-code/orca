import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountFixture } from '../test-support/rpc-recording/recorder-fixture-shape'
import { FakeSession } from '../transport/mobile-endpoint-supervisor-test-fakes'
import type { RepoSummary } from './mobile-tasks-provider-detail-types'
import { useHostRepoList } from './use-host-repo-list'
import { useMobileTasksTaskListLoading } from './use-mobile-tasks-task-list-loading'

vi.mock('./mobile-tasks-dependencies', async () => {
  const { useCallback, useEffect, useRef } = await import('react')
  return { useCallback, useEffect, useRef }
})
vi.mock('./mobile-tasks-legacy-foundation', async () => import('./mobile-tasks-item-mapping'))

const mounted: ReactTestRenderer[] = []

afterEach(() => {
  act(() => {
    for (const renderer of mounted.splice(0)) {
      renderer.unmount()
    }
  })
})

// Restored resume state or a deep link can still name a provider; assert the load never reaches Linear.
function mountFor(provider: 'dart' | 'linear') {
  const client = new FakeSession('connected')
  client.sendRequest.mockResolvedValue({ id: 'guard', ok: true, result: [] })
  const setItems = vi.fn()
  const setError = vi.fn()
  const resetGitHubItemsState = vi.fn()
  const holder: { load?: () => Promise<void> } = {}

  function Probe() {
    const repos = useHostRepoList(client, async (): Promise<RepoSummary[]> => [])
    holder.load = useMobileTasksTaskListLoading(
      mountFixture<Parameters<typeof useMobileTasksTaskListLoading>[0]>({
        appliedQuery: '',
        client,
        clientRef: { current: client },
        connState: 'connected',
        githubMode: 'items',
        gitlabFilter: 'opened',
        gitlabView: 'project',
        jiraConnection: { connected: false, selection: null },
        jiraFilter: 'assigned',
        effectiveRepoIds: new Set<string>(),
        serverRepoList: [],
        linearConnected: true,
        loadGenerationRef: { current: 0 },
        provider,
        repoListEnsureLoaded: repos.ensureLoaded,
        resetGitHubItemsState,
        setError,
        setItems,
        setLoading: vi.fn(),
        setRefreshing: vi.fn(),
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
    client,
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
  it('shows the deferred notice instead of reading Linear', async () => {
    const fixture = mountFor('dart')

    await fixture.load()

    expect(fixture.client.sendRequest).not.toHaveBeenCalledWith(
      'linear.listIssues',
      expect.anything(),
      expect.anything()
    )
    expect(fixture.setItems).toHaveBeenLastCalledWith([])
    expect(fixture.setError).toHaveBeenLastCalledWith(
      "This task source isn't available in Orca Mobile yet."
    )
  })

  // Proves the deferred branch short-circuits the Linear fallthrough every other provider still takes.
  it('reports the Linear read failure for a Linear provider', async () => {
    const fixture = mountFor('linear')

    await fixture.load()

    expect(fixture.setError).toHaveBeenLastCalledWith('Unable to load Linear issues. Try again.')
  })
})
