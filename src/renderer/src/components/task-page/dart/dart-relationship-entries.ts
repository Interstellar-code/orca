import type { DartTask } from '../../../../../shared/dart/dart-types'
import { useAppStore } from '@/store'
import { dartTaskIdentityKey } from '@/store/slices/dart/dart-task-identity'
import { dartRelationshipEntryFor } from './dart-board-columns'
import type { DartRelationshipCacheEntry } from './dart-board-contracts'

/** Task-id-keyed relationship entries on a relationships host: on-hold rows without a read are "not checked" (D14.3). */
export function buildDartRelationshipEntries(
  tasks: readonly DartTask[],
  cache: Readonly<Record<string, DartRelationshipCacheEntry>>,
  identity: { hostKey: string; accountKey: string }
): Map<string, DartRelationshipCacheEntry> {
  const cached = new Map<string, DartRelationshipCacheEntry>()
  const entries = new Map<string, DartRelationshipCacheEntry>()
  for (const task of tasks) {
    const entry = cache[dartTaskIdentityKey({ ...identity, taskId: task.id })]
    if (entry) {
      cached.set(task.id, entry)
    }
    const resolved = dartRelationshipEntryFor(task, cached, true)
    if (resolved) {
      entries.set(task.id, resolved)
    }
  }
  return entries
}

/** Selected only on a relationships host, so other hosts take no store subscription. */
export function useDartRelationshipCache(
  relationshipsHost: boolean
): Readonly<Record<string, DartRelationshipCacheEntry>> | undefined {
  return useAppStore((state) => (relationshipsHost ? state.dartRelationshipCache : undefined))
}
