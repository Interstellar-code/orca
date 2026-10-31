import { describe, expect, it } from 'vitest'

import {
  shouldHideTaskPageListChrome,
  type TaskPageListChromeVisibilityState
} from './task-page-list-chrome-visibility'

const baseState: TaskPageListChromeVisibilityState = {
  taskSource: 'github',
  hasGitHubDetail: false,
  hasGitLabDetail: false,
  hasJiraDetail: false,
  hasDartDetail: false,
  hasLinearIssueDetail: false,
  hasLinearProjectContext: false,
  hasLinearViewContext: false
}

describe('shouldHideTaskPageListChrome', () => {
  it('keeps chrome visible when only another provider has stale detail state', () => {
    expect(
      shouldHideTaskPageListChrome({
        ...baseState,
        taskSource: 'github',
        hasJiraDetail: true,
        hasDartDetail: true,
        hasLinearProjectContext: true,
        hasLinearViewContext: true
      })
    ).toBe(false)
    expect(
      shouldHideTaskPageListChrome({
        ...baseState,
        taskSource: 'jira',
        hasGitHubDetail: true,
        hasGitLabDetail: true,
        hasLinearIssueDetail: true
      })
    ).toBe(false)
  })

  it.each([
    ['github', 'hasGitHubDetail'],
    ['gitlab', 'hasGitLabDetail'],
    ['jira', 'hasJiraDetail'],
    ['dart', 'hasDartDetail'],
    ['linear', 'hasLinearIssueDetail']
  ] as const)('hides chrome over an open %s detail', (taskSource, detailKey) => {
    expect(shouldHideTaskPageListChrome({ ...baseState, taskSource, [detailKey]: true })).toBe(true)
  })
})
