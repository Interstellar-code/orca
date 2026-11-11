import { useEffect, useMemo } from 'react'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { DartReadScope } from '@/store/slices/dart/dart-read-coordination'
import { useAppStore } from '@/store'
import type { DartScopeMeta } from './dart-board-contracts'
import { isDartTaskOnHold } from './dart-board-columns'

const ON_HOLD_READ_BATCH = 20
const MAX_TRACKED_SCOPES = 16

type Publication = {
  id: number
  meta: DartScopeMeta
  // Frozen when the publication is first observed, so later row changes never add automatic reads.
  targets: readonly string[]
  attempted: Set<string>
}

// Never reset: the store's per-scope generation restarts after eviction, so it cannot name a publication for the session.
let lastPublicationId = 0
// Module-level so a remount on the same publication does not read again; oldest scopes drop first.
const publicationByScope = new Map<string, Publication>()

// Replacements of the same publication (partial-reason change, "Show 50 more") keep generation and fetchedAt.
function isSamePublication(previous: DartScopeMeta, next: DartScopeMeta): boolean {
  return (
    previous === next ||
    (previous.generation === next.generation && previous.fetchedAt === next.fetchedAt)
  )
}

function dropPublication(scopeKey: string): void {
  publicationByScope.delete(scopeKey)
}

/** Idempotent: a meta that continues the scope's last seen publication keeps its id, anything else (first sight, new generation, gap) gets a new one. */
function observePublication(
  scopeKey: string,
  scopeMeta: DartScopeMeta,
  rows: readonly DartTask[]
): Publication {
  const known = publicationByScope.get(scopeKey)
  if (known && isSamePublication(known.meta, scopeMeta)) {
    known.meta = scopeMeta
    return known
  }
  lastPublicationId += 1
  const publication: Publication = {
    id: lastPublicationId,
    meta: scopeMeta,
    targets: rows
      .filter(isDartTaskOnHold)
      .slice(0, ON_HOLD_READ_BATCH)
      .map((task) => task.id),
    attempted: new Set()
  }
  dropPublication(scopeKey)
  publicationByScope.set(scopeKey, publication)
  if (publicationByScope.size > MAX_TRACKED_SCOPES) {
    const [oldest] = publicationByScope.keys()
    dropPublication(oldest)
  }
  return publication
}

/** Session-unique id of the read set the scope currently shows; "Check" keys its retry rotation on it. */
export function dartOnHoldPublicationId(
  scopeKey: string,
  scopeMeta: DartScopeMeta,
  rows: readonly DartTask[]
): number {
  return observePublication(scopeKey, scopeMeta, rows).id
}

/** The id "Check" keys its retry rotation on, shared with the automatic reads so it resets on every publication. */
export function useDartOnHoldPublication(
  enabled: boolean,
  scopeKey: string | null,
  scopeMeta: DartScopeMeta | undefined,
  rows: readonly DartTask[] | undefined
): string {
  return useMemo(
    () =>
      enabled && scopeKey && scopeMeta && rows
        ? String(dartOnHoldPublicationId(scopeKey, scopeMeta, rows))
        : '',
    [enabled, scopeKey, scopeMeta, rows]
  )
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
  useEffect(() => {
    if (!scopeKey) {
      return
    }
    // An evicted scope breaks the lineage, so a republish at the same generation is a new publication.
    if (!scopeMeta || !scopeEntryTasks) {
      dropPublication(scopeKey)
      return
    }
    const publication = observePublication(scopeKey, scopeMeta, scopeEntryTasks)
    if (!active) {
      return
    }
    const batch = publication.targets.filter((id) => !publication.attempted.has(id))
    if (batch.length === 0) {
      return
    }
    for (const id of batch) {
      publication.attempted.add(id)
    }
    void readDartOnHoldRelationships(batch)
  }, [active, scopeKey, scopeEntryTasks, scopeMeta, readDartOnHoldRelationships])
}
