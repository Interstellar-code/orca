// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadDartViewMode, saveDartViewMode } from './dart-view-mode-storage'

const KEY = 'orca.dart.view-mode.v1'
const DEFAULTS = { layout: 'list', showEmptyColumns: false, nestSubtasks: true } as const

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('dart view mode storage', () => {
  it('round-trips the non-default layout, empty-column and nesting choices', () => {
    const mode = { layout: 'board', showEmptyColumns: true, nestSubtasks: false } as const
    saveDartViewMode(mode)
    expect(loadDartViewMode()).toEqual(mode)
  })

  it('stores only non-defaults and removes the key when all are default', () => {
    saveDartViewMode({ layout: 'board', showEmptyColumns: false, nestSubtasks: true })
    expect(JSON.parse(localStorage.getItem(KEY) ?? '')).toEqual({ layout: 'board' })
    saveDartViewMode({ layout: 'list', showEmptyColumns: false, nestSubtasks: false })
    expect(JSON.parse(localStorage.getItem(KEY) ?? '')).toEqual({ nestSubtasks: false })
    saveDartViewMode(DEFAULTS)
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('falls back to defaults for malformed or unknown values and ignores unknown keys', () => {
    localStorage.setItem(KEY, '{nope')
    expect(loadDartViewMode()).toEqual(DEFAULTS)
    localStorage.setItem(
      KEY,
      JSON.stringify({ layout: 'grid', showEmptyColumns: 'yes', nestSubtasks: 'no' })
    )
    expect(loadDartViewMode()).toEqual(DEFAULTS)
    localStorage.setItem(KEY, JSON.stringify({ layout: 'board', unknown: true }))
    expect(loadDartViewMode()).toEqual({ ...DEFAULTS, layout: 'board' })
  })

  it('keeps working when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    expect(loadDartViewMode()).toEqual(DEFAULTS)
    expect(() =>
      saveDartViewMode({ layout: 'board', showEmptyColumns: true, nestSubtasks: false })
    ).not.toThrow()
  })
})
