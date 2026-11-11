import { describe, expect, it } from 'vitest'
import {
  MAX_DART_SAVED_VIEW_ID_LENGTH,
  MAX_DART_SAVED_VIEW_NAME_LENGTH,
  MAX_DART_SAVED_VIEWS,
  mutateDartSavedViewState,
  normalizeDartSavedViewState,
  type DartSavedView
} from './dart-saved-views'
import { DartSavedViewMutationParam } from '../rpc-contract/dart-saved-view-params'
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

  it('keeps filter values exactly as saved, including surrounding spaces', () => {
    const padded = makeView('a')
    padded.filters = {
      ...padded.filters,
      status: ' Doing ',
      dartboard: '  Board ',
      tag: ' t ',
      priority: ' High ',
      search: '  find me '
    }
    expect(normalizeDartSavedViewState({ views: [padded], activeViewId: null }).views).toEqual([
      padded
    ])
    expect(mutateDartSavedViewState(null, { kind: 'save', view: padded }).views).toEqual([padded])
  })

  it('drops a view whose filter value is over the cap, padded or not', () => {
    const overCap = 'x'.repeat(DART_TITLE_MAX_LENGTH + 1)
    const padded = ` ${'x'.repeat(DART_TITLE_MAX_LENGTH)} `
    for (const value of [overCap, padded]) {
      for (const key of ['status', 'dartboard', 'tag', 'priority', 'search'] as const) {
        const view = makeView('a')
        view.filters[key] = value
        expect(normalizeDartSavedViewState({ views: [view], activeViewId: null }).views).toEqual([])
      }
    }
  })

  it('refuses an id or name over its limit on the raw value, even when padding is the excess', () => {
    const paddedId = ` ${'i'.repeat(MAX_DART_SAVED_VIEW_ID_LENGTH)} `
    const paddedName = ` ${'n'.repeat(MAX_DART_SAVED_VIEW_NAME_LENGTH)} `
    expect(normalizeDartSavedViewState({ views: [makeView(paddedId)] }).views).toEqual([])
    expect(normalizeDartSavedViewState({ views: [makeView('a', paddedName)] }).views).toEqual([])
    for (const view of [makeView(paddedId), makeView('a', paddedName)]) {
      expect(DartSavedViewMutationParam.safeParse({ kind: 'save', view }).success).toBe(false)
    }
    expect(
      DartSavedViewMutationParam.safeParse({ kind: 'rename', id: 'a', name: paddedName }).success
    ).toBe(false)
  })

  it('refuses a padded over-cap filter value in the mutation params', () => {
    const view = makeView('a')
    view.filters.search = ` ${'x'.repeat(DART_TITLE_MAX_LENGTH)} `
    expect(DartSavedViewMutationParam.safeParse({ kind: 'save', view }).success).toBe(false)
    view.filters.search = ' ok '
    view.filters.status = ' ok '
    expect(DartSavedViewMutationParam.safeParse({ kind: 'save', view })).toMatchObject({
      success: true,
      data: { view: { filters: { search: ' ok ', status: ' ok ' } } }
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

describe('release B saved-view fields', () => {
  it('keeps blockedOnHold and nestSubtasks when present', () => {
    const view = { ...makeView('a'), nestSubtasks: false }
    view.filters = { ...view.filters, blockedOnHold: true }
    expect(normalizeDartSavedViewState({ views: [view], activeViewId: 'a' }).views).toEqual([view])
    expect(mutateDartSavedViewState(null, { kind: 'save', view }).views).toEqual([view])
  })

  it('leaves both fields absent for a view that omits them', () => {
    const [kept] = normalizeDartSavedViewState({ views: [makeView('a')], activeViewId: null }).views
    expect(kept).toBeDefined()
    expect(kept).not.toHaveProperty('nestSubtasks')
    expect(kept?.filters).not.toHaveProperty('blockedOnHold')
  })

  it('drops a view with a non-boolean value for either field', () => {
    const badNest = { ...makeView('a'), nestSubtasks: 'yes' }
    const badBlocked = { ...makeView('b'), filters: { ...makeView('b').filters, blockedOnHold: 1 } }
    expect(normalizeDartSavedViewState({ views: [badNest, badBlocked] }).views).toEqual([])
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
