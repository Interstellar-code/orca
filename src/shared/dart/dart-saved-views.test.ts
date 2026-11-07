import { describe, expect, it } from 'vitest'
import {
  MAX_DART_SAVED_VIEWS,
  mutateDartSavedViewState,
  normalizeDartSavedViewState,
  type DartSavedView
} from './dart-saved-views'
import { DART_TITLE_MAX_LENGTH } from './dart-text-limits'

function makeView(id: string, name = `View ${id}`): DartSavedView {
  return {
    id,
    name,
    filters: {
      mine: false,
      status: null,
      dartboard: null,
      search: '',
      tag: null,
      priority: null,
      onHold: false
    },
    layout: 'list',
    showEmptyColumns: false
  }
}

describe('normalizeDartSavedViewState', () => {
  it('drops views beyond the cap', () => {
    const views = Array.from({ length: MAX_DART_SAVED_VIEWS + 1 }, (_, i) => makeView(`v${i}`))
    expect(normalizeDartSavedViewState({ views, activeViewId: null }).views).toHaveLength(
      MAX_DART_SAVED_VIEWS
    )
  })

  it('drops a view with an 81-character name', () => {
    const state = normalizeDartSavedViewState({
      views: [makeView('a', 'x'.repeat(81)), makeView('b')],
      activeViewId: null
    })
    expect(state.views.map((view) => view.id)).toEqual(['b'])
  })

  it('drops a case-insensitive duplicate name', () => {
    const state = normalizeDartSavedViewState({
      views: [makeView('a', 'Mine'), makeView('b', 'mINE')],
      activeViewId: null
    })
    expect(state.views.map((view) => view.id)).toEqual(['a'])
  })

  it('drops a view whose search is over the cap', () => {
    const long = makeView('a')
    long.filters.search = 'x'.repeat(DART_TITLE_MAX_LENGTH + 1)
    expect(normalizeDartSavedViewState({ views: [long], activeViewId: 'a' })).toEqual({
      views: [],
      activeViewId: null
    })
  })

  it('strips unknown keys', () => {
    const input = { ...makeView('a'), extra: 1, filters: { ...makeView('a').filters, junk: true } }
    expect(normalizeDartSavedViewState({ views: [input], activeViewId: 'a' })).toEqual({
      views: [makeView('a')],
      activeViewId: 'a'
    })
  })
})

describe('mutateDartSavedViewState', () => {
  const base = { views: [makeView('a'), makeView('b')], activeViewId: 'a' }

  it('adds a new id and replaces an existing id in place', () => {
    const added = mutateDartSavedViewState(base, { kind: 'save', view: makeView('c') })
    expect(added.views.map((view) => view.id)).toEqual(['a', 'b', 'c'])
    const replaced = mutateDartSavedViewState(base, {
      kind: 'save',
      view: { ...makeView('a'), name: 'Renamed', layout: 'board' }
    })
    expect(replaced.views.map((view) => view.name)).toEqual(['Renamed', 'View b'])
    expect(replaced.views[0]?.layout).toBe('board')
  })

  it('refuses a rename to a duplicate name', () => {
    expect(mutateDartSavedViewState(base, { kind: 'rename', id: 'a', name: 'view B' })).toEqual(
      base
    )
  })

  it('clears activeViewId when the active view is deleted', () => {
    expect(mutateDartSavedViewState(base, { kind: 'delete', id: 'a' })).toEqual({
      views: [makeView('b')],
      activeViewId: null
    })
  })

  it('selects null for an unknown id', () => {
    expect(mutateDartSavedViewState(base, { kind: 'select', id: 'zzz' }).activeViewId).toBeNull()
  })
})
