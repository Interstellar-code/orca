import {
  resolveVisibleTaskProvider,
  type TaskProvider
} from '../../../../src/shared/work-items/task-providers'
import { isSelectedMobileTaskProvider } from '../providers/mobile-task-provider-visibility'
import { normalizeJiraFilter } from '../providers/jira/mobile-jira-issue-filters'
import type { RuntimeTaskSettings, TaskResumeState } from '../mobile-tasks-view-state-types'
import {
  githubKindFromQuery,
  normalizeGitHubPreset,
  normalizeLinearFilter
} from '../item-detail/mobile-tasks-item-mapping'
import { getTaskPresetQuery } from '../../../../src/shared/work-items/task-preset-query'
import { scopeGitHubTaskSearch } from '../../../../src/shared/work-items/task-github-search'

export type HydratedTaskViewState = {
  provider: TaskProvider
  githubPreset: ReturnType<typeof normalizeGitHubPreset>
  defaultGithubPreset: ReturnType<typeof normalizeGitHubPreset>
  githubKind: ReturnType<typeof githubKindFromQuery>
  linearFilter: ReturnType<typeof normalizeLinearFilter>
  jiraFilter: ReturnType<typeof normalizeJiraFilter>
  query: string
  appliedQuery: string
}

export function resolveHydratedTaskViewState(args: {
  settings: RuntimeTaskSettings
  resume: TaskResumeState
  requestedTaskSource: TaskProvider | undefined
  visibleProviders: TaskProvider[]
}): HydratedTaskViewState {
  const { settings, resume, requestedTaskSource, visibleProviders } = args
  // A saved default or route source may name a provider this build cannot read; fall back to a supported one.
  const requestedProvider = isSelectedMobileTaskProvider(requestedTaskSource)
    ? requestedTaskSource
    : undefined
  const savedDefaultProvider = isSelectedMobileTaskProvider(settings.defaultTaskSource)
    ? settings.defaultTaskSource
    : undefined
  const provider =
    requestedProvider && visibleProviders.includes(requestedProvider)
      ? requestedProvider
      : resolveVisibleTaskProvider(savedDefaultProvider, visibleProviders)
  // A cleared preset preserves the typed query; an absent preset uses the host default.
  const githubPreset =
    resume.githubItemsPreset === null
      ? normalizeGitHubPreset(settings.defaultTaskViewPreset)
      : normalizeGitHubPreset(resume.githubItemsPreset ?? settings.defaultTaskViewPreset)
  const githubQuery =
    resume.githubItemsPreset === null
      ? (resume.githubItemsQuery ?? '')
      : getTaskPresetQuery(githubPreset)
  const query =
    provider === 'github'
      ? githubQuery
      : provider === 'linear'
        ? (resume.linearQuery ?? '')
        : provider === 'jira'
          ? (resume.jiraQuery ?? '')
          : ''
  return {
    provider,
    githubPreset,
    defaultGithubPreset: normalizeGitHubPreset(settings.defaultTaskViewPreset),
    githubKind: githubKindFromQuery(githubQuery, githubPreset),
    linearFilter: normalizeLinearFilter(resume.linearPreset),
    jiraFilter: normalizeJiraFilter(resume.jiraPreset),
    query,
    appliedQuery:
      provider === 'github'
        ? scopeGitHubTaskSearch(githubQuery, githubKindFromQuery(githubQuery, githubPreset))
        : query
  }
}
