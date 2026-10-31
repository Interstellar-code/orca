import { describe, expect, it } from 'vitest'
import { normalizeWorkspaceAttachment } from '../workspace-attachment-normalization'
import { normalizeWorkspaceLinkedItem } from '../workspace-linked-item'
import {
  buildDartWorkspaceSource,
  buildJiraWorkspaceSource,
  buildLinearWorkspaceSource,
  buildWorkspaceSourceSelection,
  getWorkspaceSourceName,
  getWorkspaceSourceProvider,
  shouldApplyWorkspaceSourceAutoName,
  shouldPreserveWorkspaceSourceOnRepoChange
} from './workspace-source'

describe('workspace source policy', () => {
  it.each(['347', '002', '#347', 'https://github.com/fixture/repo/issues/347'])(
    'keeps manual name %s after the query field becomes a selected source',
    (currentName) => {
      expect(
        shouldApplyWorkspaceSourceAutoName({
          currentName,
          lastAutoName: 'fix-export',
          lookupTextIsQuery: false
        })
      ).toBe(false)
      expect(
        shouldApplyWorkspaceSourceAutoName({
          currentName,
          lastAutoName: 'fix-export'
        })
      ).toBe(true)
    }
  )
  const linear = buildLinearWorkspaceSource({
    identifier: 'ENG-42',
    title: 'Ship mobile parity',
    url: 'https://linear.app/acme/issue/ENG-42/ship-mobile-parity',
    workspaceId: 'workspace-1',
    branchName: '  team/eng-42-ship-mobile-parity  '
  })

  it('builds one Linear identity for desktop and mobile create flows', () => {
    expect(linear).toMatchObject({
      provider: 'linear',
      number: 0,
      linearIdentifier: 'ENG-42',
      linearWorkspaceId: 'workspace-1',
      linearOrganizationUrlKey: 'acme',
      linearBranchName: 'team/eng-42-ship-mobile-parity'
    })
    expect(getWorkspaceSourceName(linear)).toEqual({
      seedName: 'eng-42-ship-mobile-parity',
      displayName: 'ENG-42 Ship mobile parity'
    })
  })

  it('persists a Jira title without repeating its separately stored identifier', () => {
    expect(
      buildJiraWorkspaceSource({
        key: 'ORCA-123',
        title: 'Fix Jira card details',
        url: 'https://company.atlassian.net/browse/ORCA-123'
      })
    ).toEqual({
      provider: 'jira',
      type: 'issue',
      number: 0,
      title: 'Fix Jira card details',
      url: 'https://company.atlassian.net/browse/ORCA-123',
      jiraIdentifier: 'ORCA-123'
    })
  })

  it('preserves global work-item sources across repo changes', () => {
    expect(shouldPreserveWorkspaceSourceOnRepoChange(linear)).toBe(true)
    expect(
      shouldPreserveWorkspaceSourceOnRepoChange({
        provider: 'jira',
        type: 'issue',
        number: 0,
        title: 'Workspace scoped',
        url: 'https://acme.atlassian.net/browse/FUS-1'
      })
    ).toBe(true)
    // Jira smart results may omit provider; preserve via URL/identifier inference too.
    expect(
      shouldPreserveWorkspaceSourceOnRepoChange({
        type: 'issue',
        number: 0,
        title: 'Inferred Jira',
        url: 'https://acme.atlassian.net/browse/FUS-1',
        jiraIdentifier: 'FUS-1'
      })
    ).toBe(true)
    expect(
      shouldPreserveWorkspaceSourceOnRepoChange({
        provider: 'github',
        type: 'issue',
        number: 1,
        title: 'Repo scoped',
        url: 'https://github.com/o/r/issues/1'
      })
    ).toBe(false)
    // GitLab is repo-scoped; clear explicit and URL-inferred sources through folder/project-group delegates too.
    expect(
      shouldPreserveWorkspaceSourceOnRepoChange({
        provider: 'gitlab',
        type: 'mr',
        number: 2,
        title: 'Repo scoped MR',
        url: 'https://gitlab.com/o/r/-/merge_requests/2'
      })
    ).toBe(false)
    expect(
      shouldPreserveWorkspaceSourceOnRepoChange({
        type: 'issue',
        number: 3,
        title: 'Inferred GitLab',
        url: 'https://gitlab.example.com/g/p/-/work_items/3'
      })
    ).toBe(false)
    expect(shouldPreserveWorkspaceSourceOnRepoChange(null)).toBe(false)
  })

  it('shares provider inference, selection labels, and auto-name gates', () => {
    const legacyGitLab = {
      type: 'issue' as const,
      number: 7,
      title: 'Self hosted',
      url: 'https://gitlab.example.com/g/p/-/work_items/7'
    }
    expect(getWorkspaceSourceProvider(legacyGitLab)).toBe('gitlab')
    expect(buildWorkspaceSourceSelection({ linkedWorkItem: legacyGitLab })).toMatchObject({
      kind: 'gitlab-issue',
      label: '#7 Self hosted'
    })
    expect(shouldApplyWorkspaceSourceAutoName({ currentName: '#42', lastAutoName: 'old' })).toBe(
      true
    )
    expect(
      shouldApplyWorkspaceSourceAutoName({ currentName: 'my workspace', lastAutoName: 'old' })
    ).toBe(false)
  })
})

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
