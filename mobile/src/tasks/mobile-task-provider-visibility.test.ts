import { describe, expect, it } from 'vitest'
import {
  isSelectedMobileTaskProvider,
  normalizeMobileVisibleTaskProviders
} from './mobile-task-provider-visibility'

describe('mobile task provider visibility', () => {
  it('drops dart from a stored provider list and keeps the others', () => {
    expect(normalizeMobileVisibleTaskProviders(['github', 'dart', 'linear'])).toEqual([
      'github',
      'linear'
    ])
  })

  it('falls back to a selectable default when only dart was stored', () => {
    const result = normalizeMobileVisibleTaskProviders(['dart'])
    expect(result.length).toBeGreaterThan(0)
    expect(result).not.toContain('dart')
  })

  it('does not select dart but selects other providers', () => {
    expect(isSelectedMobileTaskProvider('dart')).toBe(false)
    expect(isSelectedMobileTaskProvider('github')).toBe(true)
  })
})
