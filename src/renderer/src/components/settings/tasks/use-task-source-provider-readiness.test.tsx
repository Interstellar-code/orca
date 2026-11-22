// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getProviderRuntimeContextKey } from '@/runtime/hosts/observations/provider-runtime-context'
import { useTaskSourceProviderReadiness } from './use-task-source-provider-readiness'

type StoreState = Record<string, unknown>

const mocks = vi.hoisted((): { state: StoreState } => ({ state: {} }))

vi.mock('@/store/index', () => ({
  useAppStore: (selector: (state: StoreState) => unknown) => selector(mocks.state)
}))

vi.mock('@/hooks/skills/runtime/useActiveProjectSkillRuntime', () => ({
  useActiveProjectSkillRuntime: () => ({ discoveryTarget: undefined })
}))

vi.mock('@/lib/work-items/linear/useLinearProviderConnected', () => ({
  useLinearProviderConnected: () => false
}))

vi.mock('@/hooks/skills/discovery/useInstalledAgentSkills', () => ({
  GLOBAL_AGENT_SKILL_SOURCE_KINDS: ['home'],
  useInstalledAgentSkillNames: () => ({
    installed: false,
    loading: false,
    settled: true,
    installedUnverifiable: false
  })
}))

vi.mock('@/runtime/hosts/preflight/local-preflight-context', () => ({
  getLocalPreflightContext: () => ({})
}))

vi.mock('@/runtime/hosts/preflight/local-preflight-context-key', () => ({
  localPreflightContextKey: () => 'local'
}))

const settings = { activeRuntimeEnvironmentId: null }

function installState(overrides: StoreState = {}): void {
  mocks.state = {
    settings,
    preflightStatus: null,
    preflightStatusChecked: true,
    preflightStatusContextKey: 'local',
    preflightStatusError: null,
    preflightStatusLoading: false,
    jiraStatus: { connected: false },
    jiraStatusChecked: true,
    jiraStatusContextKey: getProviderRuntimeContextKey(settings),
    linearStatusChecked: true,
    linearStatusContextKey: getProviderRuntimeContextKey(settings),
    dartStatus: { connected: true, viewer: { id: 'aB3dE5gH7jK9', name: 'Alex Example' } },
    dartStatusChecked: true,
    dartStatusContextKey: getProviderRuntimeContextKey(settings),
    dartUpdateRequired: false,
    ...overrides
  }
}

function dartReadiness(visible: readonly ('github' | 'dart')[] = ['github']) {
  return renderHook(() => useTaskSourceProviderReadiness(visible)).result.current.dart
}

describe('useTaskSourceProviderReadiness for Dart', () => {
  beforeEach(() => installState())

  it('reports a verified Dart token as connected, hidden by default', () => {
    expect(dartReadiness()).toEqual({ connected: true, checking: false, visible: false })
  })

  it('reflects visibility from the visible providers', () => {
    expect(dartReadiness(['github', 'dart']).visible).toBe(true)
  })

  it('reports checking until the status for the active runtime has been read', () => {
    installState({ dartStatusChecked: false })
    expect(dartReadiness()).toMatchObject({ connected: false, checking: true })

    installState({ dartStatusContextKey: 'another-runtime' })
    expect(dartReadiness()).toMatchObject({ connected: false, checking: true })
  })

  it('never reports connected for a remote host that needs an update', () => {
    installState({ dartUpdateRequired: true })
    expect(dartReadiness()).toMatchObject({ connected: false, checking: false })
  })

  it('reports not connected without a token', () => {
    installState({ dartStatus: { connected: false, viewer: null } })
    expect(dartReadiness()).toMatchObject({ connected: false, checking: false })
  })
})
