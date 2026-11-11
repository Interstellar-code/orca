import type { DartTask } from '../../../../../shared/dart/dart-types'
import { useAppStore } from '@/store'
import { dartTaskIdentityKey } from '@/store/slices/dart/dart-task-identity'
import { dartRelationshipEntryFor } from './dart-board-columns'
import type { DartRelationshipCacheEntry } from './dart-board-contracts'
import { dartPublicationRelationshipEntry } from './dart-publication-relationship-entries'

/** Task-id-keyed relationship entries on a relationships host: on-hold rows not read in the current publication are "not checked" (D14.3). */
export function buildDartRelationshipEntries(
  tasks: readonly DartTask[],
  cache: Readonly<Record<string, DartRelationshipCacheEntry>>,
  identity: { hostKey: string; accountKey: string },
  publicationId: number | undefined
): Map<string, DartRelationshipCacheEntry> {
  const cached = new Map<string, DartRelationshipCacheEntry>()
  const entries = new Map<string, DartRelationshipCacheEntry>()
  for (const task of tasks) {
    const entry = dartPublicationRelationshipEntry(
      cache[dartTaskIdentityKey({ ...identity, taskId: task.id })],
      publicationId
    )
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
