import { DART_TITLE_MAX_LENGTH } from './dart-text-limits'

export const MAX_DART_SAVED_VIEWS = 50
export const MAX_DART_SAVED_VIEW_ID_LENGTH = 128
export const MAX_DART_SAVED_VIEW_NAME_LENGTH = 80

export const DART_SAVED_VIEWS_RUNTIME_CAPABILITY = 'dart.savedViews.v1' as const
export const DART_SAVED_VIEWS_UPDATE_REQUIRED =
  'Update the remote Orca server to save and reuse views.'

export type DartLayout = 'list' | 'board'

export type DartBoardFilters = {
  mine: boolean
  status: string | null
  dartboard: string | null
  search: string
  tag: string | null
  priority: string | null
  onHold: boolean
}

export type DartSavedView = {
  id: string
  name: string
  filters: DartBoardFilters
  layout: DartLayout
  showEmptyColumns: boolean
}

export type DartSavedViewState = {
  views: DartSavedView[]
  activeViewId: string | null
}

export type DartSavedViewMutation =
  | { kind: 'save'; view: DartSavedView }
  | { kind: 'rename'; id: string; name: string }
  | { kind: 'delete'; id: string }
  | { kind: 'select'; id: string | null }

function normalizeBoundedName(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const normalized = value.trim()
  return normalized.length === 0 || normalized.length > maxLength ? null : normalized
}

type NullableFilterResult = { ok: true; value: string | null } | { ok: false }

function normalizeNullableFilter(value: unknown): NullableFilterResult {
  if (value === null) {
    return { ok: true, value: null }
  }
  if (typeof value !== 'string') {
    return { ok: false }
  }
  const trimmed = value.trim()
  if (trimmed.length > DART_TITLE_MAX_LENGTH) {
    return { ok: false }
  }
  return { ok: true, value: trimmed.length === 0 ? null : trimmed }
}

function normalizeBoardFilters(value: unknown): DartBoardFilters | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  if (!('mine' in value) || typeof value.mine !== 'boolean') {
    return null
  }
  if (!('onHold' in value) || typeof value.onHold !== 'boolean') {
    return null
  }
  if (
    !('search' in value) ||
    typeof value.search !== 'string' ||
    value.search.length > DART_TITLE_MAX_LENGTH
  ) {
    return null
  }
  const status = normalizeNullableFilter('status' in value ? value.status : undefined)
  const dartboard = normalizeNullableFilter('dartboard' in value ? value.dartboard : undefined)
  const tag = normalizeNullableFilter('tag' in value ? value.tag : undefined)
  const priority = normalizeNullableFilter('priority' in value ? value.priority : undefined)
  if (!status.ok || !dartboard.ok || !tag.ok || !priority.ok) {
    return null
  }
  return {
    mine: value.mine,
    status: status.value,
    dartboard: dartboard.value,
    search: value.search,
    tag: tag.value,
    priority: priority.value,
    onHold: value.onHold
  }
}

function normalizeDartSavedView(candidate: unknown): DartSavedView | null {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return null
  }
  if (
    !('id' in candidate) ||
    !('name' in candidate) ||
    !('filters' in candidate) ||
    !('layout' in candidate) ||
    !('showEmptyColumns' in candidate)
  ) {
    return null
  }
  const id = normalizeBoundedName(candidate.id, MAX_DART_SAVED_VIEW_ID_LENGTH)
  const name = normalizeBoundedName(candidate.name, MAX_DART_SAVED_VIEW_NAME_LENGTH)
  const filters = normalizeBoardFilters(candidate.filters)
  const { layout, showEmptyColumns } = candidate
  if (
    !id ||
    !name ||
    !filters ||
    (layout !== 'list' && layout !== 'board') ||
    typeof showEmptyColumns !== 'boolean'
  ) {
    return null
  }
  return { id, name, filters, layout, showEmptyColumns }
}

function normalizeDartSavedViews(value: unknown): DartSavedView[] {
  if (!Array.isArray(value)) {
    return []
  }
  const views: DartSavedView[] = []
  const ids = new Set<string>()
  const names = new Set<string>()
  for (const candidate of value) {
    const view = normalizeDartSavedView(candidate)
    if (!view) {
      continue
    }
    const lowerName = view.name.toLowerCase()
    if (ids.has(view.id) || names.has(lowerName)) {
      continue
    }
    views.push(view)
    ids.add(view.id)
    names.add(lowerName)
    if (views.length === MAX_DART_SAVED_VIEWS) {
      break
    }
  }
  return views
}

export function normalizeDartSavedViewState(value: unknown): DartSavedViewState {
  if (!value || typeof value !== 'object' || !('views' in value)) {
    return { views: [], activeViewId: null }
  }
  const views = normalizeDartSavedViews(value.views)
  const activeViewId =
    'activeViewId' in value &&
    typeof value.activeViewId === 'string' &&
    views.some((view) => view.id === value.activeViewId)
      ? value.activeViewId
      : null
  return { views, activeViewId }
}

export function mutateDartSavedViewState(
  value: unknown,
  mutation: DartSavedViewMutation
): DartSavedViewState {
  const state = normalizeDartSavedViewState(value)
  if (mutation.kind === 'select') {
    const known = mutation.id !== null && state.views.some((view) => view.id === mutation.id)
    return { ...state, activeViewId: known ? mutation.id : null }
  }
  if (mutation.kind === 'delete') {
    return normalizeDartSavedViewState({
      views: state.views.filter((view) => view.id !== mutation.id),
      activeViewId: state.activeViewId === mutation.id ? null : state.activeViewId
    })
  }
  if (mutation.kind === 'rename') {
    const name = normalizeBoundedName(mutation.name, MAX_DART_SAVED_VIEW_NAME_LENGTH)
    const target = state.views.find((view) => view.id === mutation.id)
    if (!name || !target || isNameTaken(state.views, name, mutation.id)) {
      return state
    }
    return normalizeDartSavedViewState({
      ...state,
      views: state.views.map((view) => (view.id === mutation.id ? { ...view, name } : view))
    })
  }
  const view = normalizeDartSavedView(mutation.view)
  if (!view) {
    return state
  }
  const exists = state.views.some((item) => item.id === view.id)
  if (
    (!exists && state.views.length >= MAX_DART_SAVED_VIEWS) ||
    isNameTaken(state.views, view.name, view.id)
  ) {
    return state
  }
  return normalizeDartSavedViewState({
    ...state,
    views: exists
      ? state.views.map((item) => (item.id === view.id ? view : item))
      : [...state.views, view]
  })
}

function isNameTaken(views: DartSavedView[], name: string, exceptId: string): boolean {
  const lower = name.toLowerCase()
  return views.some((view) => view.id !== exceptId && view.name.toLowerCase() === lower)
}
