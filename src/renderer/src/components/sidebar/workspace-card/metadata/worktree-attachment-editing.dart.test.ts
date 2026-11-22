import { describe, expect, it } from 'vitest'
import { parseWorkspaceAttachmentInput } from './worktree-attachment-editing'

describe('pasting a Dart link as a workspace attachment', () => {
  it('turns a Dart task link into a Dart attachment keyed by the task id', () => {
    expect(
      parseWorkspaceAttachmentInput(
        'https://app.dartai.com/t/aB3dE5gH7jK9-search-results-ignore',
        'github-issue'
      )
    ).toEqual({
      provider: 'dart',
      type: 'issue',
      number: 0,
      identifier: 'aB3dE5gH7jK9',
      dartIdentifier: 'aB3dE5gH7jK9',
      url: 'https://app.dartai.com/t/aB3dE5gH7jK9'
    })
  })

  it.each([
    'https://app.dartai.com/d/aB3dE5gH7jK9-board',
    'https://app.dartai.com/t/short',
    'http://app.dartai.com/t/aB3dE5gH7jK9',
    'https://app.dartai.com.evil.example/t/aB3dE5gH7jK9'
  ])('does not accept %s', (value) => {
    expect(parseWorkspaceAttachmentInput(value, 'github-issue')).toBeNull()
  })
})
