import { expect, it } from 'vitest'
import { getWorkspaceAttachmentSourceLabel } from './workspace-attachment-source-label'

it('labels a Dart attachment with its host, ignoring the title slug in the task path', () => {
  expect(
    getWorkspaceAttachmentSourceLabel({
      provider: 'dart',
      type: 'issue',
      number: 0,
      dartIdentifier: 'aB3dE5gH7jK9',
      url: 'https://app.dartai.com/t/aB3dE5gH7jK9-search-results'
    })
  ).toBe('app.dartai.com')
})
