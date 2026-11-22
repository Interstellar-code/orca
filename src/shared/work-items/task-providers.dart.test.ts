import { describe, expect, it } from 'vitest'
import {
  filterAvailableTaskProviders,
  normalizeTaskProviderSettings,
  restoreAvailableDefaultTaskProvider
} from './task-providers'

const nothingConnected = { gitlabInstalled: false, linearConnected: false }

describe('Dart task provider availability', () => {
  it('keeps a disconnected Dart visible as its setup entry, unlike Linear', () => {
    expect(filterAvailableTaskProviders(['github', 'linear', 'dart'], nothingConnected)).toEqual([
      'github',
      'dart'
    ])
  })

  it('does not tie Dart to the Linear connection', () => {
    expect(
      filterAvailableTaskProviders(['dart'], { gitlabInstalled: false, linearConnected: true })
    ).toEqual(['dart'])
  })

  it('restores a saved Dart default that is not in the visible list', () => {
    expect(restoreAvailableDefaultTaskProvider(['github'], nothingConnected, 'dart')).toEqual([
      'github',
      'dart'
    ])
  })
})

describe('Dart is opt-in', () => {
  it('leaves Dart out of the visible sources for a profile that never chose it', () => {
    const settings = normalizeTaskProviderSettings({
      visibleTaskProviders: undefined,
      defaultTaskSource: undefined
    })
    expect(settings.visibleTaskProviders).not.toContain('dart')
  })

  it('keeps Dart visible once the user chose it', () => {
    expect(
      normalizeTaskProviderSettings({
        visibleTaskProviders: ['github', 'dart'],
        defaultTaskSource: 'dart'
      })
    ).toEqual({ defaultTaskSource: 'dart', visibleTaskProviders: ['github', 'dart'] })
  })

  it('repairs a drifted profile whose saved default is Dart by adding Dart back', () => {
    expect(
      normalizeTaskProviderSettings({ visibleTaskProviders: ['github'], defaultTaskSource: 'dart' })
        .visibleTaskProviders
    ).toEqual(['github', 'dart'])
  })
})
