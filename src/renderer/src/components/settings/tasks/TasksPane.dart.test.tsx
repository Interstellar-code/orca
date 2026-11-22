// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../../shared/orca-profiles/constants'
import type { GlobalSettings } from '../../../../../shared/settings/global-settings-types'
import type { TaskProvider } from '../../../../../shared/work-items/task-providers'
import type { TaskProviderReadiness } from './task-source-setup-state'
import { TasksPane } from './TasksPane'

type DartSetupProps = { onOpenIntegrations: () => void; onConnected: () => void }

const mocks = vi.hoisted(() => {
  const readiness: Partial<Record<TaskProvider, TaskProviderReadiness>> = {}
  const dartSetupProps: DartSetupProps[] = []
  return {
    readiness,
    dartSetupProps,
    openSettingsPage: vi.fn(),
    openSettingsTarget: vi.fn(),
    checkDartConnection: vi.fn()
  }
})

vi.mock('./use-task-source-provider-readiness', () => ({
  useTaskSourceProviderReadiness: () => mocks.readiness
}))

vi.mock('../../../runtime/hosts/observations/use-integration-provider-status-refresh', () => ({
  useIntegrationProviderStatusRefresh: vi.fn()
}))

vi.mock('./TaskSourceLinearSetup', () => ({ TaskSourceLinearSetup: () => null }))
vi.mock('./TaskSourceJiraSetup', () => ({ JiraSetupSteps: () => null }))

vi.mock('./TaskSourceCodeHostSetup', () => ({
  CodeHostSetupSteps: ({ providerLabel }: { providerLabel: string }) => (
    <div data-testid={`code-host-${providerLabel}`} />
  )
}))

vi.mock('./TaskSourceDartSetup', () => ({
  DartSetupSteps: (props: DartSetupProps) => {
    mocks.dartSetupProps.push(props)
    return <div data-testid="dart-setup" />
  }
}))

function selectState(selector: (state: Record<string, unknown>) => unknown): unknown {
  return selector({
    openSettingsPage: mocks.openSettingsPage,
    openSettingsTarget: mocks.openSettingsTarget,
    checkJiraConnection: vi.fn(),
    checkDartConnection: mocks.checkDartConnection,
    dartUpdateRequired: false,
    refreshPreflightStatus: vi.fn(),
    settingsSearchQuery: ''
  })
}

vi.mock('@/store/index', () => ({ useAppStore: selectState }))
vi.mock('@/store/retained-views/app-state-view', () => ({ useAppStateValue: selectState }))

const settings: GlobalSettings = {
  ...getDefaultSettings('/preview'),
  visibleTaskProviders: ['github', 'gitlab', 'linear', 'dart'],
  defaultTaskSource: 'github'
}

function renderExpandedDart(dart: TaskProviderReadiness): void {
  mocks.readiness.dart = dart
  render(<TasksPane settings={settings} updateSettings={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Show Dart setup steps' }))
}

describe('TasksPane Dart provider', () => {
  beforeEach(() => {
    mocks.dartSetupProps = []
    mocks.openSettingsPage.mockClear()
    mocks.openSettingsTarget.mockClear()
    mocks.checkDartConnection.mockClear()
    mocks.readiness = {
      github: { connected: true, checking: false, visible: true },
      gitlab: { connected: true, checking: false, visible: true },
      linear: {
        connected: true,
        checking: false,
        // Linear claims the single auto-expanded slot, so Dart opens only via its toggle.
        skillInstalled: false,
        skillChecking: false,
        visible: true
      },
      jira: { connected: false, checking: false, visible: false },
      dart: { connected: false, checking: false, visible: false }
    }
  })

  afterEach(() => {
    cleanup()
  })

  it('renders its own setup steps and never the code-host (GitHub/GitLab) steps', () => {
    renderExpandedDart({ connected: false, checking: false, visible: true })

    expect(screen.queryByTestId('dart-setup')).not.toBeNull()
    expect(screen.queryByTestId('code-host-Dart')).toBeNull()
  })

  it('deep-links Manage token to the Dart integration card', () => {
    renderExpandedDart({ connected: true, checking: false, visible: true })

    mocks.dartSetupProps.at(-1)?.onOpenIntegrations()

    expect(mocks.openSettingsPage).toHaveBeenCalledOnce()
    expect(mocks.openSettingsTarget).toHaveBeenCalledWith({
      pane: 'integrations',
      repoId: null,
      sectionId: 'integrations-dart'
    })
  })

  it('re-checks the Dart connection after a token is saved from Tasks', () => {
    renderExpandedDart({ connected: false, checking: false, visible: true })

    mocks.dartSetupProps.at(-1)?.onConnected()

    expect(mocks.checkDartConnection).toHaveBeenCalledOnce()
  })
})
