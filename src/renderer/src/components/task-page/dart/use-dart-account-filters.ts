import { useState } from 'react'
import type { DartBoardFilters } from '../../../../../shared/dart/dart-saved-views'
import { DEFAULT_DART_BOARD_FILTERS } from './task-page-dart-list-model'

export function useDartAccountFilters(hostKey: string, accountKey: string) {
  const [filters, setFilters] = useState<DartBoardFilters>(DEFAULT_DART_BOARD_FILTERS)
  const ownerKey = JSON.stringify([hostKey, accountKey])
  const [owner, setOwner] = useState(ownerKey)
  if (owner !== ownerKey) {
    setOwner(ownerKey)
    setFilters((current) => ({
      ...current,
      mine: DEFAULT_DART_BOARD_FILTERS.mine,
      dartboard: DEFAULT_DART_BOARD_FILTERS.dartboard
    }))
  }
  return [filters, setFilters] as const
}
