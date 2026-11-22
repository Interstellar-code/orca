import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../theme/mobile-theme', () => ({ colors: { textMuted: '#999' } }))
vi.mock('../../components/icons/TaskProviderLogo', () => ({ TaskProviderLogo: 'TaskProviderLogo' }))
vi.mock('../../components/feedback/MobileStateView', () => ({ MobileStateView: 'MobileStateView' }))
vi.mock('../project-board/mobile-tasks-github-project-list', () => ({
  renderMobileTasksGitHubProjectList: () => 'GitHubProjectList'
}))
vi.mock('../providers/linear/mobile-tasks-linear-list', () => ({
  renderMobileTasksLinearList: () => 'LinearList'
}))
vi.mock('./mobile-tasks-provider-item-list', () => ({
  renderMobileTasksProviderItemList: () => 'ProviderItemList'
}))
vi.mock('../providers/JiraConnectPrompt', () => ({ JiraConnectPrompt: 'JiraConnectPrompt' }))
// The support-state renderer reaches native-only transport and component modules outside this branch test.
vi.mock('./mobile-tasks-list-state', () => ({ renderMobileTasksSupportState: () => null }))

import { renderMobileTasksListSurface } from './mobile-tasks-list-surface'
import type { ConnectionPresentationModel } from '../screen-state/use-mobile-tasks-connection-presentation'
import type { MobileColorScheme } from '../../theme/mobile-theme'

const colorScheme: MobileColorScheme = 'light'

function surfaceFor(provider: string): string[] {
  let renderer: ReactTestRenderer | null = null
  act(() => {
    renderer = create(
      createElement(
        'Surface',
        null,
        renderMobileTasksListSurface(
          // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: this branch test supplies only the fields renderMobileTasksListSurface reads; every other model field is deliberately absent.
          {
            provider,
            tasksSupported: true,
            taskUiReady: true,
            linearConnected: true,
            jiraConnection: { connected: true }
          } as unknown as ConnectionPresentationModel,
          colorScheme,
          0
        )
      )
    )
  })
  const mounted = renderer!
  const strings = mounted.root
    .findAll((node) => typeof node.type === 'string')
    .flatMap((node) => {
      const title: unknown = node.props.title
      if (typeof title === 'string') {
        return [title]
      }
      return typeof node.children?.[0] === 'string' ? [node.children[0]] : []
    })
  act(() => mounted.unmount())
  return strings
}

describe('Tasks list surface provider branches', () => {
  // A restored resume state can carry a deferred provider; it must show the notice, not the Linear list.
  it('shows the deferred notice instead of a Linear list', () => {
    const strings = surfaceFor('dart')

    expect(strings).toContain("This task source isn't available in Orca Mobile yet.")
    expect(strings).not.toContain('ProviderItemList')
    expect(strings).not.toContain('LinearList')
  })

  it('still renders Linear for linear', () => {
    expect(surfaceFor('linear')).toContain('LinearList')
  })
})
