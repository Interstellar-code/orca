import { useState } from 'react'
import { DEFAULT_DART_LIST_FILTERS, type DartListFilters } from './task-page-dart-list-model'

export function useDartAccountFilters(hostKey: string, accountKey: string) {
  const [filters, setFilters] = useState<DartListFilters>(DEFAULT_DART_LIST_FILTERS)
  const ownerKey = JSON.stringify([hostKey, accountKey])
  const [owner, setOwner] = useState(ownerKey)
  if (owner !== ownerKey) {
    setOwner(ownerKey)
    setFilters((current) => ({
      ...current,
      mine: DEFAULT_DART_LIST_FILTERS.mine,
      dartboard: DEFAULT_DART_LIST_FILTERS.dartboard
    }))
  }
  return [filters, setFilters] as const
}
