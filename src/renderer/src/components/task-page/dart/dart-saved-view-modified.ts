import type {
  DartBoardFilters,
  DartLayout,
  DartSavedView
} from '../../../../../shared/dart/dart-saved-views'

export type DartViewSnapshotValue = {
  filters: DartBoardFilters
  layout: DartLayout
  showEmptyColumns: boolean
  nestSubtasks: boolean
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

/** Release A views and host-dropped fields leave these absent: they mean nested on and the blocked chip off. */
export function dartViewSnapshot(
  view: Pick<DartSavedView, 'filters' | 'layout' | 'showEmptyColumns' | 'nestSubtasks'>
): DartViewSnapshotValue {
  return {
    filters: { ...view.filters, blockedOnHold: view.filters.blockedOnHold ?? false },
    layout: view.layout,
    showEmptyColumns: view.showEmptyColumns,
    nestSubtasks: view.nestSubtasks ?? true
  }
}

export function isDartSavedViewModified(
  view: DartSavedView,
  current: DartViewSnapshotValue
): boolean {
  const saved = dartViewSnapshot(view)
  const now = dartViewSnapshot(current)
  return (
    saved.layout !== now.layout ||
    saved.showEmptyColumns !== now.showEmptyColumns ||
    saved.nestSubtasks !== now.nestSubtasks ||
    saved.filters.blockedOnHold !== now.filters.blockedOnHold ||
    FILTER_KEYS.some((key) => saved.filters[key] !== now.filters[key])
  )
}
