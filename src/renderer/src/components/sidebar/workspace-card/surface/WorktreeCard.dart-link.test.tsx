// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../../../shared/orca-profiles/constants'
import { useAppStore } from '@/store'
import type { WorktreeCardProperty } from '../../../../../../shared/ui-chrome/ui-chrome-types'
import type { Repo } from '../../../../../../shared/repository/repo-types'
import type { WorkspaceAttachment, Worktree } from '../../../../../../shared/worktree/types'

let worktreeCardProperties: WorktreeCardProperty[] = []
const WORKTREE_CARD_IMPORT_TIMEOUT_MS = 180_000

vi.mock('@/lib/workspace/activation/worktree-activation', () => ({
  activateAndRevealWorktree: vi.fn()
}))
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))
vi.mock('../activity/use-worktree-activity-status', () => ({
  useWorktreeActivityStatus: () => 'idle'
}))
vi.mock('../../workspace-actions/sleep/use-worktree-sleep-state', () => ({
  useIsSleepingWorktree: () => false,
  selectIsSleepingWorktree: () => false
}))
vi.mock('../activity/CacheTimer', () => ({
  default: () => null,
  usePromptCacheCountdownStartedAt: () => null
}))
vi.mock('../activity/WorktreeCardAgents', () => ({ default: () => null }))
vi.mock('../../workspace-actions/context-menu/WorktreeContextMenu', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
  WORKTREE_NATIVE_CONTEXT_MENU_ATTR: 'data-worktree-native-context-menu',
  WORKTREE_CONTEXT_MENU_SCOPE_ATTR: 'data-orca-context-menu-scope'
}))

const repo: Repo = {
  id: 'repo-1',
  path: '/repo',
  displayName: 'orca',
  badgeColor: '#999999',
  addedAt: 1
}
const dartLink: WorkspaceAttachment = {
  provider: 'dart',
  type: 'issue',
  number: 0,
  identifier: 'aB3dE5gH7jK9',
  dartIdentifier: 'aB3dE5gH7jK9',
  title: 'Search results ignore archived projects',
  url: 'https://app.dartai.com/t/aB3dE5gH7jK9'
}

function worktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    id: 'repo-1::/repo/worktrees/dart',
    repoId: 'repo-1',
    path: '/repo/worktrees/dart',
    displayName: 'Dart tree',
    branch: 'feature/dart',
    head: 'abc123',
    isBare: false,
    isMainWorktree: false,
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 1,
    linkedItems: [dartLink],
    ...overrides
  }
}

async function renderCard(style: 'detailed' | 'new'): Promise<string> {
  useAppStore.setState({
    settings: {
      ...getDefaultSettings('/home/test'),
      compactWorktreeCards: false,
      experimentalNewWorktreeCardStyle: style === 'new'
    }
  })
  // Separate update: a settings change re-applies the card mode's default properties.
  useAppStore.setState({ worktreeCardProperties })
  const { default: WorktreeCard } = await import('./WorktreeCard')
  // A client render: server rendering reads the store's initial state, not these updates.
  const { container } = render(<WorktreeCard worktree={worktree()} repo={repo} isActive={false} />)
  return container.innerHTML
}

describe('WorktreeCard with a Dart link', () => {
  // The card's module graph is large; load it once so no single test pays for the import.
  beforeAll(async () => {
    await import('./WorktreeCard')
  }, WORKTREE_CARD_IMPORT_TIMEOUT_MS)

  beforeEach(() => {
    worktreeCardProperties = ['status', 'issue', 'linear-issue', 'jira-issue']
  })

  afterEach(() => {
    cleanup()
  })

  it.each(['detailed', 'new'] as const)(
    'shows the Dart badge with the task identifier, never a GitHub-style #0 (%s card)',
    async (style) => {
      const markup = await renderCard(style)
      expect(markup).toContain('data-workspace-reference-stack="dart"')
      expect(markup).toContain('Linked Dart aB3dE5gH7jK9')
      expect(markup).not.toContain('#0')
      expect(markup).not.toContain('Linked issue')
    }
  )

  it('keeps the Dart badge when only the Jira task property is on, since Dart has no property of its own', async () => {
    worktreeCardProperties = ['status', 'jira-issue']
    expect(await renderCard('new')).toContain('data-workspace-reference-stack="dart"')
  })

  it('hides the Dart badge when every task property is off', async () => {
    worktreeCardProperties = ['status']
    expect(await renderCard('new')).not.toContain('data-workspace-reference-stack="dart"')
  })
})
