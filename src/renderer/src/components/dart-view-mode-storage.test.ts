// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadDartViewMode, saveDartViewMode } from './dart-view-mode-storage'

const KEY = 'orca.dart.view-mode.v1'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('dart view mode storage', () => {
  it('round-trips the non-default layout and empty-column choice', () => {
    saveDartViewMode({ layout: 'board', showEmptyColumns: true })
    expect(loadDartViewMode()).toEqual({ layout: 'board', showEmptyColumns: true })
  })

  it('stores only non-defaults and removes the key when both are default', () => {
    saveDartViewMode({ layout: 'board', showEmptyColumns: false })
    expect(JSON.parse(localStorage.getItem(KEY) ?? '')).toEqual({ layout: 'board' })
    saveDartViewMode({ layout: 'list', showEmptyColumns: false })
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('falls back to defaults for malformed or unknown values and ignores unknown keys', () => {
    localStorage.setItem(KEY, '{nope')
    expect(loadDartViewMode()).toEqual({ layout: 'list', showEmptyColumns: false })
    localStorage.setItem(KEY, JSON.stringify({ layout: 'grid', showEmptyColumns: 'yes' }))
    expect(loadDartViewMode()).toEqual({ layout: 'list', showEmptyColumns: false })
    localStorage.setItem(KEY, JSON.stringify({ layout: 'board', nestSubtasks: true }))
    expect(loadDartViewMode()).toEqual({ layout: 'board', showEmptyColumns: false })
  })

  it('keeps working when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    expect(loadDartViewMode()).toEqual({ layout: 'list', showEmptyColumns: false })
    expect(() => saveDartViewMode({ layout: 'board', showEmptyColumns: true })).not.toThrow()
  })
})
