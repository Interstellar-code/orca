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
