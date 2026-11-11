import { useEffect } from 'react'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { DartReadScope } from '@/store/slices/dart/dart-read-coordination'
import { dartTaskIdentity, dartTaskIdentityKey } from '@/store/slices/dart/dart-task-identity'
import { useAppStore } from '@/store'
import type { DartScopeMeta } from './dart-board-contracts'
import { isDartTaskOnHold } from './dart-board-columns'

const ON_HOLD_READ_BATCH = 20
const MAX_TRACKED_SCOPES = 16

// Module-level so a remount on the same publication does not read again; oldest scopes drop first.
const attemptedByScope = new Map<string, { generation: number; ids: Set<string> }>()

function attemptedIn(scopeKey: string, generation: number): Set<string> {
  const record = attemptedByScope.get(scopeKey)
  if (record?.generation === generation) {
    return record.ids
  }
  attemptedByScope.delete(scopeKey)
  const fresh = { generation, ids: new Set<string>() }
  attemptedByScope.set(scopeKey, fresh)
  if (attemptedByScope.size > MAX_TRACKED_SCOPES) {
    const [oldest] = attemptedByScope.keys()
    attemptedByScope.delete(oldest)
  }
  return fresh.ids
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
  const { active, scopeKey, scopeEntryTasks, scopeMeta, pageScope, viewerId } = args
  const readDartOnHoldRelationships = useAppStore((s) => s.readDartOnHoldRelationships)
  // Meta generation rises once per published read set, partial or complete, so it is the publication identity.
  const generation = scopeMeta?.generation ?? null
  useEffect(() => {
    if (!active || !scopeKey || generation === null || !scopeEntryTasks) {
      return
    }
    const attempted = attemptedIn(scopeKey, generation)
    const cache = useAppStore.getState().dartRelationshipCache
    // An emptied store restarts its generations, so an attempt counts only while the store still holds an entry for it.
    const attemptedHere = (id: string): boolean =>
      attempted.has(id) && dartTaskIdentityKey(dartTaskIdentity(pageScope, id, viewerId)) in cache
    const batch = scopeEntryTasks
      .filter(isDartTaskOnHold)
      .slice(0, ON_HOLD_READ_BATCH)
      .map((candidate) => candidate.id)
      .filter((id) => !attemptedHere(id))
    if (batch.length === 0) {
      return
    }
    for (const id of batch) {
      attempted.add(id)
    }
    void readDartOnHoldRelationships(batch)
  }, [
    active,
    scopeKey,
    scopeEntryTasks,
    generation,
    pageScope,
    viewerId,
    readDartOnHoldRelationships
  ])
}
