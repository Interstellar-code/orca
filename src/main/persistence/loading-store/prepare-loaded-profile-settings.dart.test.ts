import { homedir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { getDefaultPersistedState } from '../../../shared/constants'
import type { GlobalSettings } from '../../../shared/global-settings-types'
import type { PersistedState } from '../../../shared/persisted-state-types'
import { prepareLoadedProfileSettings } from './prepare-loaded-profile-settings'

function loadTaskProviders(overrides: Partial<GlobalSettings>) {
  const defaults = getDefaultPersistedState(homedir())
  const parsed: PersistedState = {
    ...defaults,
    settings: { ...defaults.settings, ...overrides }
  }
  return prepareLoadedProfileSettings(parsed, defaults, () => {}).taskProviderSettings
}

describe('loading a profile with Dart as a task source', () => {
  it('does not turn Dart on for a profile that never chose it', () => {
    const loaded = loadTaskProviders({
      visibleTaskProviders: ['github', 'linear'],
      defaultTaskSource: 'github'
    })
    expect(loaded.visibleTaskProviders).not.toContain('dart')
  })

  it('keeps Dart and a Dart default for a profile that chose it', () => {
    const loaded = loadTaskProviders({
      visibleTaskProviders: ['github', 'dart'],
      defaultTaskSource: 'dart'
    })
    expect(loaded.visibleTaskProviders).toContain('dart')
    expect(loaded.defaultTaskSource).toBe('dart')
  })
})
