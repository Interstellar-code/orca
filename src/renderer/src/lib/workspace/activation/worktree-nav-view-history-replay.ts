import { useAppStore } from '@/store/index'
import type { WorktreeNavHistoryViewEntry } from '@/store/slices/ui/workspace-navigation-history'

// Detail fields every replay clears so one provider's retained detail never survives another's replay.
const CLEARED_TASK_DETAILS = {
  openGitHubWorkItem: undefined,
  openGitHubSourceContext: undefined,
  openGitHubInitialTab: undefined,
  openGitLabWorkItem: undefined,
  openGitLabSourceContext: undefined,
  openLinearIssue: undefined,
  openLinearSourceContext: undefined,
  openJiraIssue: undefined,
  openJiraSourceContext: undefined,
  openDartTask: undefined,
  openDartSourceContext: undefined
} as const

// Replay via setActiveView: open*Page would mutate previousViewBefore* or duplicate history (navigateToIndex).
export function applyWorktreeNavViewEntry(entry: WorktreeNavHistoryViewEntry): void {
  if (entry === 'automations' || entry === 'artifacts' || entry === 'skills') {
    if (entry === 'automations') {
      // Why: Back/Forward is a user navigation; the page focuses its title once it settles.
      useAppStore.setState({ automationsPageFocusTitleOnOpen: true })
    }
    useAppStore.getState().setActiveView(entry)
    return
  }
  if (typeof entry === 'object' && entry.kind === 'automations-page') {
    // Why: the page owns its sub-page state; it applies this request and clears it.
    useAppStore.setState({
      activeView: 'automations',
      automationsPageLocationRequest: entry.location,
      automationsPageFocusTitleOnOpen: true
    })
    return
  }
  if (entry === 'tasks') {
    useAppStore.setState((state) => ({
      activeView: 'tasks',
      githubTaskDrawerWorkItem: null,
      taskPageData: { ...state.taskPageData, ...CLEARED_TASK_DETAILS }
    }))
    return
  }
  if (entry.source === 'github') {
    useAppStore.setState((state) => ({
      activeView: 'tasks',
      taskPageData: {
        ...state.taskPageData,
        ...CLEARED_TASK_DETAILS,
        taskSource: 'github',
        preselectedRepoId: entry.workItem.repoId,
        openGitHubWorkItem: entry.workItem,
        openGitHubSourceContext: entry.sourceContext,
        openGitHubInitialTab: entry.initialTab
      }
    }))
    return
  }
  if (entry.source === 'gitlab') {
    useAppStore.setState((state) => ({
      activeView: 'tasks',
      githubTaskDrawerWorkItem: null,
      taskPageData: {
        ...state.taskPageData,
        ...CLEARED_TASK_DETAILS,
        taskSource: 'gitlab',
        preselectedRepoId: entry.workItem.repoId,
        openGitLabWorkItem: entry.workItem,
        openGitLabSourceContext: entry.sourceContext
      }
    }))
    return
  }
  if (entry.source === 'jira') {
    useAppStore.setState((state) => ({
      activeView: 'tasks',
      githubTaskDrawerWorkItem: null,
      taskPageData: {
        ...state.taskPageData,
        ...CLEARED_TASK_DETAILS,
        taskSource: 'jira',
        openJiraIssue: entry.issue,
        openJiraSourceContext: entry.sourceContext
      }
    }))
    return
  }
  if (entry.source === 'dart') {
    useAppStore.setState((state) => ({
      activeView: 'tasks',
      githubTaskDrawerWorkItem: null,
      taskPageData: {
        ...state.taskPageData,
        ...CLEARED_TASK_DETAILS,
        taskSource: 'dart',
        openDartTask: entry.task,
        openDartSourceContext: entry.sourceContext
      }
    }))
    return
  }
  useAppStore.setState((state) => ({
    activeView: 'tasks',
    githubTaskDrawerWorkItem: null,
    taskPageData: {
      ...state.taskPageData,
      ...CLEARED_TASK_DETAILS,
      taskSource: 'linear',
      openLinearIssue: entry.issue,
      openLinearSourceContext: entry.sourceContext
    }
  }))
}
