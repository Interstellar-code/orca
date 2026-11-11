import { useEffect, useRef } from 'react'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { DartReadScope } from '@/store/slices/dart/dart-read-coordination'
import { useAppStore } from '@/store'
import type { DartScopeMeta } from './dart-board-contracts'
import { isDartTaskOnHold } from './dart-board-columns'

const ON_HOLD_READ_BATCH = 20
/** D14.3 outcome 2: every published read set reads its first 20 on-hold tasks once, whatever the cache already knows. */
export function useDartOnHoldRelationshipReads(args: {
  active: boolean
  scopeKey: string | null
  scopeEntryTasks: readonly DartTask[] | undefined
  scopeMeta: DartScopeMeta | null
  pageScope: DartReadScope
  viewerId: string | null
}): void {
  const { active, scopeKey, scopeEntryTasks, scopeMeta, pageScope } = args
  const readDartOnHoldRelationships = useAppStore((s) => s.readDartOnHoldRelationships)
  const markDartOnHoldReadPublication = useAppStore((s) => s.markDartOnHoldReadPublication)
  const publicationId = scopeMeta?.publicationId ?? 0
  // Frozen when the publication is first observed, so later row changes never add reads.
  const frozen = useRef<{ publicationId: number; targets: readonly string[] } | null>(null)
  useEffect(() => {
    if (!scopeKey) {
      return
    }
    // The marker lives on the meta, so eviction and a newer publication both clear it.
    if (!scopeMeta || publicationId === 0 || scopeMeta.onHoldReadPublicationId === publicationId) {
      return
    }
    let targets = frozen.current?.publicationId === publicationId ? frozen.current.targets : null
    if (!targets) {
      if (!scopeEntryTasks) {
        return
      }
      targets = scopeEntryTasks
        .filter(isDartTaskOnHold)
        .slice(0, ON_HOLD_READ_BATCH)
        .map((task) => task.id)
      frozen.current = { publicationId, targets }
    }
    if (!active) {
      return
    }
    markDartOnHoldReadPublication(scopeKey, publicationId)
    if (targets.length > 0) {
      void readDartOnHoldRelationships(targets, { publicationId, scope: pageScope })
    }
  }, [
    active,
    scopeKey,
    scopeEntryTasks,
    scopeMeta,
    publicationId,
    pageScope,
    readDartOnHoldRelationships,
    markDartOnHoldReadPublication
  ])
}
