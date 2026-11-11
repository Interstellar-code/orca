import { useEffect, useRef } from 'react'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import { useAppStore } from '@/store'
import type { DartReadScope } from '@/store/slices/dart/dart-read-coordination'
import { dartTaskIdentity, dartTaskIdentityKey } from '@/store/slices/dart/dart-task-identity'
import { isDartTaskOnHold } from './dart-board-columns'

const ON_HOLD_READ_BATCH = 20

/** D14.3 outcome 2: after each published read set, reads the first 20 on-hold tasks one after another. */
export function useDartOnHoldRelationshipReads(args: {
  active: boolean
  scopeKey: string | null
  scopeEntryTasks: readonly DartTask[] | undefined
  fetchedAt: number
  pageScope: DartReadScope
  viewerId: string | null
}): void {
  const { active, scopeKey, scopeEntryTasks, fetchedAt, pageScope, viewerId } = args
  const readDartOnHoldRelationships = useAppStore((s) => s.readDartOnHoldRelationships)
  const lastRun = useRef<{ scopeKey: string | null; fetchedAt: number }>({
    scopeKey: null,
    fetchedAt: 0
  })
  useEffect(() => {
    if (!active || !scopeKey || fetchedAt === 0) {
      return
    }
    const seen = lastRun.current.scopeKey === scopeKey
    if (seen && lastRun.current.fetchedAt === fetchedAt) {
      return
    }
    lastRun.current = { scopeKey, fetchedAt }
    const firstBatch = (scopeEntryTasks ?? [])
      .filter(isDartTaskOnHold)
      .slice(0, ON_HOLD_READ_BATCH)
      .map((candidate) => candidate.id)
    if (firstBatch.length === 0) {
      return
    }
    // A re-mount on a fresh entry keeps what the store already read.
    const cache = useAppStore.getState().dartRelationshipCache
    const alreadyRead = firstBatch.every(
      (id) => cache[dartTaskIdentityKey(dartTaskIdentity(pageScope, id, viewerId))]
    )
    if (!seen && alreadyRead) {
      return
    }
    void readDartOnHoldRelationships(firstBatch)
  }, [
    active,
    scopeKey,
    scopeEntryTasks,
    fetchedAt,
    pageScope,
    viewerId,
    readDartOnHoldRelationships
  ])
}
