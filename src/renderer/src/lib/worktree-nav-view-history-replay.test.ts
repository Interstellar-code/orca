import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DartTask } from '../../../shared/dart/dart-types'
import type { TaskSourceContext } from '../../../shared/task-source-context'
import { useAppStore } from '@/store'
import {
  setWorktreeNavActivator,
  setWorktreeNavViewActivator
} from '@/store/slices/worktree-nav-history'
import { applyWorktreeNavViewEntry } from './worktree-nav-view-history-replay'

const task: DartTask = {
  id: 'aB3dE5gH7jK9',
  title: 'Search results ignore archived projects',
  htmlUrl: 'https://app.dartai.com/t/aB3dE5gH7jK9-search-results',
  tags: []
}
const sourceContext: TaskSourceContext = {
  kind: 'task-source',
  provider: 'dart',
  projectId: 'account-backed-task-source',
  hostId: 'local',
  providerIdentity: { provider: 'dart', userId: 'uSeR1d2e3f4g' },
  accountLabel: 'Alex Example'
}

describe('Dart task detail navigation history', () => {
  beforeEach(() => {
    setWorktreeNavActivator(vi.fn())
    setWorktreeNavViewActivator(applyWorktreeNavViewEntry)
    useAppStore.setState({
      activeView: 'terminal',
      taskPageData: {},
      worktreeNavHistory: [],
      worktreeNavHistoryIndex: -1
    })
  })
  afterEach(() => {
    setWorktreeNavActivator(null)
    setWorktreeNavViewActivator(null)
  })

  it('returns to the open Dart detail, not another provider, when going back from another view', () => {
    const state = useAppStore.getState()
    state.openTaskPage({
      taskSource: 'dart',
      openDartTask: task,
      openDartSourceContext: sourceContext
    })
    useAppStore.getState().openAutomationsPage()
    expect(useAppStore.getState().activeView).toBe('automations')

    useAppStore.getState().goBackWorktree()

    const { activeView, taskPageData } = useAppStore.getState()
    expect(activeView).toBe('tasks')
    expect(taskPageData.taskSource).toBe('dart')
    expect(taskPageData.openDartTask?.id).toBe(task.id)
    expect(taskPageData.openDartSourceContext).toEqual(sourceContext)
    expect(taskPageData.openJiraIssue).toBeUndefined()
    expect(taskPageData.openLinearIssue).toBeUndefined()
    expect(taskPageData.openGitHubWorkItem).toBeUndefined()
  })

  it('clears the Dart detail when history replays the plain Tasks list', () => {
    const state = useAppStore.getState()
    state.openTaskPage({ taskSource: 'dart' })
    useAppStore.getState().openTaskPage({ taskSource: 'dart', openDartTask: task })
    expect(useAppStore.getState().taskPageData.openDartTask?.id).toBe(task.id)

    useAppStore.getState().goBackWorktree()

    expect(useAppStore.getState().activeView).toBe('tasks')
    expect(useAppStore.getState().taskPageData.openDartTask).toBeUndefined()
  })
})
