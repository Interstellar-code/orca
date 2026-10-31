import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  normalizeWorkspaceAttachments,
  toWorkspaceLinkedItem
} from './workspace-attachment-normalization'
import type { WorkspaceAttachment } from './worktree/types'

function pr(number: number, repository?: string): WorkspaceAttachment {
  return {
    provider: 'github',
    type: 'pr',
    number,
    ...(repository ? { url: `https://github.com/acme/${repository}/pull/${number}` } : {})
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('workspace attachment normalization', () => {
  it('preserves global order, enrichment chains and ambiguous sources across identity groups', () => {
    const origin = { kind: 'observed', tabId: 'terminal' } as const
    const second = pr(2, 'repo')
    const issue: WorkspaceAttachment = { provider: 'github', type: 'issue', number: 1 }
    const scoped: WorkspaceAttachment = {
      ...pr(1, 'repo'),
      taskSourceContext: {
        kind: 'task-source',
        provider: 'github',
        projectId: 'project',
        hostId: 'local'
      }
    }
    const linearA: WorkspaceAttachment = {
      provider: 'linear',
      type: 'issue',
      number: 0,
      identifier: 'ENG-1'
    }
    const linearB: WorkspaceAttachment = { ...linearA, identifier: 'OPS-1' }
    const normalized = normalizeWorkspaceAttachments([
      { ...pr(1), title: 'First', origins: [origin] },
      second,
      pr(1, 'repo'),
      issue,
      scoped,
      pr(3),
      pr(3, 'a'),
      pr(4),
      pr(3, 'b'),
      linearA,
      linearB,
      { ...second, title: 'Updated second' }
    ])
    expect(normalized).toMatchObject([
      { ...second, title: 'Updated second' },
      issue,
      { ...scoped, title: 'First', origins: [origin] },
      pr(3),
      pr(3, 'a'),
      pr(4),
      pr(3, 'b'),
      linearA,
      linearB
    ])
    expect(normalizeWorkspaceAttachments(normalized)).toEqual(normalized)
  })
})

describe('Dart attachments', () => {
  const dart = (dartIdentifier: string, slug: string): WorkspaceAttachment => ({
    provider: 'dart',
    type: 'issue',
    number: 0,
    dartIdentifier,
    title: 'Ship Dart',
    url: `https://app.dartai.com/t/${dartIdentifier}-${slug}`
  })

  it('keeps a number-0 Dart task and dedupes it by identifier, not number or slug', () => {
    const normalized = normalizeWorkspaceAttachments([
      dart('aBcD3fGh1jKl', 'ship-dart'),
      dart('aBcD3fGh1jKl', 'renamed-task'),
      dart('zYxW9vUt8sRq', 'ship-dart')
    ])
    expect(normalized.map((item) => item.identifier)).toEqual(['aBcD3fGh1jKl', 'zYxW9vUt8sRq'])
    expect(normalized[0]).toMatchObject({ provider: 'dart', number: 0 })
  })

  it('rejects non-issue Dart attachments', () => {
    expect(normalizeWorkspaceAttachments([{ ...dart('aBcD3fGh1jKl', 'x'), type: 'pr' }])).toEqual(
      []
    )
  })

  it('carries the Dart identifier into the linked item', () => {
    const [item] = normalizeWorkspaceAttachments([dart('aBcD3fGh1jKl', 'ship-dart')])
    expect(toWorkspaceLinkedItem({ ...item, dartIdentifier: undefined })).toMatchObject({
      provider: 'dart',
      number: 0,
      dartIdentifier: 'aBcD3fGh1jKl'
    })
  })
})
