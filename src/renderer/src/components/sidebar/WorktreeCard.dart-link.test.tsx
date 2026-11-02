import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { WorktreeCardProperty } from '../../../../shared/ui-chrome-types'
import type { Repo } from '../../../../shared/repo-types'
import type { WorkspaceAttachment, Worktree } from '../../../../shared/worktree/types'

let worktreeCardProperties: WorktreeCardProperty[] = []
let settings: Partial<GlobalSettings> | null = null
const WORKTREE_CARD_IMPORT_TIMEOUT_MS = 180_000

vi.mock('@/store', () => {
  const getState = () => ({
    deleteStateByWorktreeId: {},
    fetchHostedReviewForBranch: vi.fn(),
    fetchIssue: vi.fn(),
    fetchLinearIssue: vi.fn(),
    gitConflictOperationByWorktree: {},
    hostedReviewCache: {},
    issueCache: {},
    linearIssueCache: {},
    openModal: vi.fn(),
    projectGroups: [],
    remoteBranchConflictByWorktreeId: {},
    settings,
    sshConnectionStates: new Map(),
    sshTargetLabels: new Map(),
    updateWorktreeMeta: vi.fn(),
    workspacePortScan: null,
    worktreeCardProperties
  })
  return {
    useAppStore: Object.assign((selector: (state: unknown) => unknown) => selector(getState()), {
      getState,
      subscribe: () => () => {}
    })
  }
})
vi.mock('@/lib/worktree-activation', () => ({ activateAndRevealWorktree: vi.fn() }))
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))
vi.mock('./use-worktree-activity-status', () => ({ useWorktreeActivityStatus: () => 'idle' }))
vi.mock('./use-worktree-sleep-state', () => ({ useIsSleepingWorktree: () => false }))
vi.mock('./CacheTimer', () => ({
  default: () => null,
  usePromptCacheCountdownStartedAt: () => null
}))
vi.mock('./WorktreeCardAgents', () => ({ default: () => null }))
vi.mock('./WorktreeContextMenu', () => ({
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
  settings = {
    compactWorktreeCards: false,
    experimentalNewWorktreeCardStyle: style === 'new'
  }
  const { default: WorktreeCard } = await import('./WorktreeCard')
  return renderToStaticMarkup(<WorktreeCard worktree={worktree()} repo={repo} isActive={false} />)
}

describe('WorktreeCard with a Dart link', () => {
  // The card's module graph is large; load it once so no single test pays for the import.
  beforeAll(async () => {
    await import('./WorktreeCard')
  }, WORKTREE_CARD_IMPORT_TIMEOUT_MS)

  beforeEach(() => {
    worktreeCardProperties = ['status', 'issue', 'linear-issue', 'jira-issue']
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
