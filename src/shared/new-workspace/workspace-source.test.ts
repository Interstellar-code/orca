import { describe, expect, it } from 'vitest'
import { normalizeWorkspaceAttachment } from '../workspace-attachments/workspace-attachment-normalization'
import { normalizeWorkspaceLinkedItem } from '../workspace-attachments/workspace-linked-item'
import {
  buildDartWorkspaceSource,
  buildWorkspaceSourceSelection,
  getWorkspaceSourceProvider,
  shouldPreserveWorkspaceSourceOnRepoChange
} from './workspace-source'

describe('Dart workspace source', () => {
  it('round-trips a Dart attachment to a Dart selection, not the Linear number-0 fallback', () => {
    const source = buildDartWorkspaceSource({
      id: 'aBcD3fGh1jKl',
      title: 'Ship Dart',
      htmlUrl: 'https://app.dartai.com/t/aBcD3fGh1jKl-ship-dart'
    })
    const attachment = normalizeWorkspaceAttachment(source)
    const linked = normalizeWorkspaceLinkedItem(attachment)
    expect(linked).toMatchObject({ provider: 'dart', dartIdentifier: 'aBcD3fGh1jKl' })
    const { provider: _provider, ...withoutProvider } = linked!
    expect(getWorkspaceSourceProvider(withoutProvider)).toBe('dart')
    expect(buildWorkspaceSourceSelection({ linkedWorkItem: withoutProvider })).toEqual({
      kind: 'dart',
      label: 'Ship Dart',
      url: 'https://app.dartai.com/t/aBcD3fGh1jKl-ship-dart'
    })
    expect(shouldPreserveWorkspaceSourceOnRepoChange(withoutProvider)).toBe(true)
  })

  it('rebuilds an off-host htmlUrl from the task id instead of storing it', () => {
    const source = buildDartWorkspaceSource({
      id: 'aBcD3fGh1jKl',
      title: 'Ship Dart',
      htmlUrl: 'https://evil.example/t/aBcD3fGh1jKl'
    })
    expect(source.url).toBe('https://app.dartai.com/t/aBcD3fGh1jKl')
  })
})
