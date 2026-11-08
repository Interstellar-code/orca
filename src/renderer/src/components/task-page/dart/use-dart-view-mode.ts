import { useCallback, useState } from 'react'
import type { DartLayout } from '../../../../../shared/dart/dart-saved-views'
import {
  loadDartViewMode,
  saveDartViewMode,
  type DartViewMode
} from '@/components/dart-view-mode-storage'

/** D10: the layout and "Show empty columns" live in the tab; the user's own changes are remembered on the device. */
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
  return { viewMode, setViewMode, setDartLayout, setDartShowEmptyColumns }
}
