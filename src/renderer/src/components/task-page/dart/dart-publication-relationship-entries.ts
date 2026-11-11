import type { DartTask } from '../../../../../shared/dart/dart-types'
import { dartTaskIdentityKey } from '@/store/slices/dart/dart-task-identity'
import { dartRelationshipEntryFor, isDartTaskOnHold } from './dart-board-columns'
import type { DartRelationshipCacheEntry } from './dart-board-contracts'

const NOT_CHECKED: DartRelationshipCacheEntry = {
  state: 'notChecked',
  relationships: null,
  fetchedAt: 0,
  error: null
}

/** D14.3: an on-hold entry is known only if it was read in the scope's current publication; any other entry is not checked. */
export function dartPublicationRelationshipEntry(
  entry: DartRelationshipCacheEntry | undefined,
  publicationId: number | undefined
): DartRelationshipCacheEntry | undefined {
  if (!entry) {
    return undefined
  }
  return publicationId !== undefined && entry.publicationId === publicationId ? entry : NOT_CHECKED
}

/** Card entries by task id plus the on-hold tasks still to check (D14.3), from one set of reconciled tasks. */
export function buildDartRelationshipView(args: {
  candidates: readonly DartTask[]
  relationshipCache: Readonly<Record<string, DartRelationshipCacheEntry>> | undefined
  hostKey: string
  accountKey: string
  publicationId: number | undefined
}): {
  entries: Map<string, DartRelationshipCacheEntry>
  unchecked: string[]
  errored: Set<string>
} {
  const { candidates, relationshipCache, hostKey, accountKey, publicationId } = args
  const cached = new Map<string, DartRelationshipCacheEntry>()
  const entries = new Map<string, DartRelationshipCacheEntry>()
  const unchecked: string[] = []
  const errored = new Set<string>()
  for (const task of candidates) {
    const entry = dartPublicationRelationshipEntry(
      relationshipCache?.[dartTaskIdentityKey({ hostKey, accountKey, taskId: task.id })],
      publicationId
    )
    if (entry) {
      cached.set(task.id, entry)
    }
    const resolved = dartRelationshipEntryFor(task, cached, true)
    if (resolved) {
      entries.set(task.id, resolved)
    }
    if (
      isDartTaskOnHold(task) &&
      (!entry || entry.state === 'notChecked' || entry.state === 'error')
    ) {
      unchecked.push(task.id)
      if (entry?.state === 'error') {
        errored.add(task.id)
      }
    }
  }
  return { entries, unchecked, errored }
}
