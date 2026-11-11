import { useEffect, useRef } from 'react'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { DartReadScope } from '@/store/slices/dart/dart-read-coordination'
import { useAppStore } from '@/store'
import type { DartScopeMeta } from './dart-board-contracts'
import { isDartTaskOnHold } from './dart-board-columns'

const ON_HOLD_READ_BATCH = 20
// The store keeps at most this many scopes, so a handled id outlives its scope only briefly.
const MAX_HANDLED_SCOPES = 300

// Store-assigned publication ids are session-unique, so a handled id survives a remount and never matches a later publication.
const handledPublicationByScope = new Map<string, number>()

function markHandled(scopeKey: string, publicationId: number): void {
  handledPublicationByScope.delete(scopeKey)
  handledPublicationByScope.set(scopeKey, publicationId)
  if (handledPublicationByScope.size > MAX_HANDLED_SCOPES) {
    const [oldest] = handledPublicationByScope.keys()
    handledPublicationByScope.delete(oldest)
  }
}

/** D14.3 outcome 2: every published read set reads its first 20 on-hold tasks once, whatever the cache already knows. */
export function useDartOnHoldRelationshipReads(args: {
  active: boolean
  scopeKey: string | null
  scopeEntryTasks: readonly DartTask[] | undefined
  scopeMeta: DartScopeMeta | null
  pageScope: DartReadScope
  viewerId: string | null
}): void {
  const { active, scopeKey, scopeEntryTasks, scopeMeta } = args
  const readDartOnHoldRelationships = useAppStore((s) => s.readDartOnHoldRelationships)
  const publicationId = scopeMeta?.publicationId ?? 0
  // Frozen when the publication is first observed, so later row changes never add reads.
  const frozen = useRef<{ publicationId: number; targets: readonly string[] } | null>(null)
  useEffect(() => {
    if (!scopeKey) {
      return
    }
    if (!scopeMeta) {
      handledPublicationByScope.delete(scopeKey)
      return
    }
    if (publicationId === 0 || handledPublicationByScope.get(scopeKey) === publicationId) {
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
    markHandled(scopeKey, publicationId)
    if (targets.length > 0) {
      void readDartOnHoldRelationships(targets)
    }
  }, [active, scopeKey, scopeEntryTasks, scopeMeta, publicationId, readDartOnHoldRelationships])
}
