import { useEffect, useRef } from 'react'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import { useAppStore } from '@/store'
import type { DartReadScope } from '@/store/slices/dart/dart-read-coordination'
import { dartTaskIdentity, dartTaskIdentityKey } from '@/store/slices/dart/dart-task-identity'
import type { DartScopeMeta } from './dart-board-contracts'
import { isDartTaskOnHold } from './dart-board-columns'

const ON_HOLD_READ_BATCH = 20

/** D14.3 outcome 2: after each published read set, reads the first 20 on-hold tasks not read since the publication, one after another. */
export function useDartOnHoldRelationshipReads(args: {
  active: boolean
  scopeKey: string | null
  scopeEntryTasks: readonly DartTask[] | undefined
  scopeMeta: DartScopeMeta | null
  pageScope: DartReadScope
  viewerId: string | null
}): void {
  const { active, scopeKey, scopeEntryTasks, scopeMeta, pageScope, viewerId } = args
  const readDartOnHoldRelationships = useAppStore((s) => s.readDartOnHoldRelationships)
  const lastRun = useRef<{ scopeKey: string | null; generation: number | null }>({
    scopeKey: null,
    generation: null
  })
  // Meta generation rises once per published read set, partial or complete, so it tells same-millisecond publications apart.
  const generation = scopeMeta?.generation ?? null
  useEffect(() => {
    if (!active || !scopeKey || generation === null || !scopeEntryTasks) {
      return
    }
    if (lastRun.current.scopeKey === scopeKey && lastRun.current.generation === generation) {
      return
    }
    lastRun.current = { scopeKey, generation }
    const cache = useAppStore.getState().dartRelationshipCache
    const batch = scopeEntryTasks
      .filter(isDartTaskOnHold)
      .filter((candidate) => {
        const entry =
          cache[dartTaskIdentityKey(dartTaskIdentity(pageScope, candidate.id, viewerId))]
        // A known entry read before this publication is stale: each read set reads on-hold tasks again (D14.3).
        return entry?.state !== 'known' || entry.fetchedAt <= (scopeMeta?.fetchedAt ?? 0)
      })
      .slice(0, ON_HOLD_READ_BATCH)
      .map((candidate) => candidate.id)
    if (batch.length > 0) {
      void readDartOnHoldRelationships(batch)
    }
  }, [
    active,
    scopeKey,
    scopeEntryTasks,
    generation,
    scopeMeta?.fetchedAt,
    pageScope,
    viewerId,
    readDartOnHoldRelationships
  ])
}
