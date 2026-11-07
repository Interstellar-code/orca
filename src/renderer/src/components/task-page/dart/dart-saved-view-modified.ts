import type {
  DartBoardFilters,
  DartLayout,
  DartSavedView
} from '../../../../../shared/dart/dart-saved-views'

export type DartViewSnapshotValue = {
  filters: DartBoardFilters
  layout: DartLayout
  showEmptyColumns: boolean
}

const FILTER_KEYS = [
  'mine',
  'status',
  'dartboard',
  'search',
  'tag',
  'priority',
  'onHold'
] as const satisfies readonly (keyof DartBoardFilters)[]

export function isDartSavedViewModified(
  view: DartSavedView,
  current: DartViewSnapshotValue
): boolean {
  return (
    view.layout !== current.layout ||
    view.showEmptyColumns !== current.showEmptyColumns ||
    FILTER_KEYS.some((key) => view.filters[key] !== current.filters[key])
  )
}
