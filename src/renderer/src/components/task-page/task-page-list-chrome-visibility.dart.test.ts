import { describe, expect, it } from 'vitest'
import {
  shouldHideTaskPageListChrome,
  type TaskPageListChromeVisibilityState
} from './task-page-list-chrome-visibility'

const noDetail: TaskPageListChromeVisibilityState = {
  taskSource: 'dart',
  hasGitHubDetail: false,
  hasGitLabDetail: false,
  hasJiraDetail: false,
  hasDartDetail: false,
  hasLinearIssueDetail: false,
  hasLinearProjectContext: false,
  hasLinearViewContext: false
}

describe('task page list chrome over a Dart detail', () => {
  it('hides the list chrome while a Dart task detail is open', () => {
    expect(shouldHideTaskPageListChrome({ ...noDetail, hasDartDetail: true })).toBe(true)
  })

  it('keeps another provider’s list chrome when only a Dart detail is retained', () => {
    expect(
      shouldHideTaskPageListChrome({ ...noDetail, taskSource: 'github', hasDartDetail: true })
    ).toBe(false)
  })
})
