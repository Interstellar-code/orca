import { useCallback, useState } from 'react'
import type { DartLayout } from '../../../../../shared/dart/dart-saved-views'
import {
  loadDartViewMode,
  saveDartViewMode,
  type DartViewMode
} from '@/components/dart-view-mode-storage'

/** D10: the layout, "Show empty columns" and "Show subtasks nested" live in the tab; the user's own changes are remembered on the device. */
export function useDartViewMode() {
  const [viewMode, setViewMode] = useState<DartViewMode>(loadDartViewMode)
  const remember = useCallback((change: Partial<DartViewMode>) => {
    setViewMode((current) => ({ ...current, ...change }))
    // Only the field the user changed is stored, so an applied view's other values never leak into device memory.
    saveDartViewMode({ ...loadDartViewMode(), ...change })
  }, [])
  const setDartLayout = useCallback((layout: DartLayout) => remember({ layout }), [remember])
  const setDartShowEmptyColumns = useCallback(
    (showEmptyColumns: boolean) => remember({ showEmptyColumns }),
    [remember]
  )
  const setDartNestSubtasks = useCallback(
    (nestSubtasks: boolean) => remember({ nestSubtasks }),
    [remember]
  )
  return { viewMode, setViewMode, setDartLayout, setDartShowEmptyColumns, setDartNestSubtasks }
}
