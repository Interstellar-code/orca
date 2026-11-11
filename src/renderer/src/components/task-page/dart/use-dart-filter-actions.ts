import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import type { DartBoardFilters } from '../../../../../shared/dart/dart-saved-views'

/** Filter setters and the search box, whose text applies on Enter. */
export function useDartFilterActions(setFilters: Dispatch<SetStateAction<DartBoardFilters>>) {
  const [dartSearchInput, setDartSearchInput] = useState('')
  const setDartFilter = useCallback(
    <K extends keyof DartBoardFilters>(key: K, value: DartBoardFilters[K]) =>
      setFilters((current) => ({ ...current, [key]: value })),
    [setFilters]
  )
  const applyDartSearch = useCallback(
    (value: string) => {
      const trimmed = value.trim()
      setDartSearchInput(trimmed)
      setDartFilter('search', trimmed)
    },
    [setDartFilter]
  )
  return { dartSearchInput, setDartSearchInput, setDartFilter, applyDartSearch }
}
