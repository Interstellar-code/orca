import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'

const reactNative = vi.hoisted(() => ({
  View: 'View',
  Text: 'Text',
  ActivityIndicator: 'ActivityIndicator',
  Pressable: 'Pressable',
  StyleSheet: { create: <Styles,>(styles: Styles) => styles, hairlineWidth: 1 }
}))
vi.mock('react-native', () => reactNative)
vi.mock('./mobile-tasks-dependencies', async () => ({
  ...reactNative,
  ...(await import('../theme/mobile-theme')),
  Linkify: undefined,
  TaskProviderLogo: 'TaskProviderLogo'
}))
vi.mock('./mobile-tasks-legacy-styles', () => ({
  styles: { centered: {}, emptyText: {}, centeredHint: {}, targetButtonText: {} }
}))
vi.mock('./mobile-tasks-github-project-list', () => ({
  renderMobileTasksGitHubProjectList: () => 'GitHubProjectList'
}))
vi.mock('./mobile-tasks-linear-list', () => ({ renderMobileTasksLinearList: () => 'LinearList' }))
vi.mock('./mobile-tasks-provider-item-list', () => ({
  renderMobileTasksProviderItemList: () => 'ProviderItemList'
}))
vi.mock('../components/JiraConnectPrompt', () => ({ JiraConnectPrompt: 'JiraConnectPrompt' }))

import { renderMobileTasksListSurface } from './mobile-tasks-list-surface'
import type { ConnectionPresentationModel } from './use-mobile-tasks-connection-presentation'

const colorScheme = 'light' as never

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
    .flatMap((node) => (typeof node.children?.[0] === 'string' ? [node.children[0]] : []))
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
