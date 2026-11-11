import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { DartBoardFilters, DartSavedView } from '../../../../../shared/dart/dart-saved-views'
import type { RuntimeClientTarget } from '../../../../../shared/runtime-client-target'
import type { DartViewMode } from '@/components/dart-view-mode-storage'
import { useTaskPageDartSavedViews } from './use-task-page-dart-saved-views'

/** D9.5: a view is applied as saved and turns linked mode off; the stored layout is device memory, not rewritten. */
export function useDartSavedViewState(args: {
  active: boolean
  target: RuntimeClientTarget
  filters: DartBoardFilters
  viewMode: DartViewMode
  setViewMode: Dispatch<SetStateAction<DartViewMode>>
  setFilters: Dispatch<SetStateAction<DartBoardFilters>>
  setSearchInput: (value: string) => void
  setHasWorkspace: (enabled: boolean) => void
}) {
  const { active, target, filters, viewMode, setViewMode, setFilters } = args
  const { setSearchInput, setHasWorkspace } = args
  const applyView = useCallback(
    (view: DartSavedView | null) => {
      if (!view) {
        return
      }
      setHasWorkspace(false)
      setFilters(view.filters)
      setSearchInput(view.filters.search)
      setViewMode({
        layout: view.layout,
        showEmptyColumns: view.showEmptyColumns,
        nestSubtasks: view.nestSubtasks ?? true
      })
    },
    [setFilters, setHasWorkspace, setSearchInput, setViewMode]
  )
  return useTaskPageDartSavedViews({
    active,
    target,
    current: {
      filters,
      layout: viewMode.layout,
      showEmptyColumns: viewMode.showEmptyColumns,
      nestSubtasks: viewMode.nestSubtasks
    },
    applyView
  })
}
