import { useMemo } from 'react'
import type { DartClientFilters } from './dart-board-contracts'

/** A host without relationships ignores the stored blocked chip; the stored value itself is never changed. */
export function useDartEffectiveClientFilters(
  client: DartClientFilters,
  relationshipsHost: boolean
): DartClientFilters {
  const { status, tag, priority, onHold } = client
  const blockedOnHold = relationshipsHost && client.blockedOnHold
  return useMemo(
    () => ({ status, tag, priority, onHold, blockedOnHold }),
    [status, tag, priority, onHold, blockedOnHold]
  )
}
