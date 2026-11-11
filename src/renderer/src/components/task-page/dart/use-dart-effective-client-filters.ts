import { useMemo } from 'react'
import type { DartClientFilters } from './dart-board-contracts'

/** A host without relationships ignores the stored blocked chip; the stored value itself is never changed. */
export function effectiveDartClientFilters(
  client: DartClientFilters,
  relationshipsHost: boolean
): DartClientFilters {
  return { ...client, blockedOnHold: relationshipsHost && client.blockedOnHold }
}

export function useDartEffectiveClientFilters(
  client: DartClientFilters,
  relationshipsHost: boolean
): DartClientFilters {
  const { status, tag, priority, onHold, blockedOnHold } = client
  return useMemo(
    () =>
      effectiveDartClientFilters(
        { status, tag, priority, onHold, blockedOnHold },
        relationshipsHost
      ),
    [status, tag, priority, onHold, blockedOnHold, relationshipsHost]
  )
}
