import type { DartAccountIdentity } from '@/store/slices/dart/dart-task-identity'

const MAX_DART_DRAFTS = 20

export type DartDraftKind = 'comment' | 'description'

/** One unresolved description hunk (T6 step 4): never applied automatically. */
export type DartDescriptionDraftHunk = {
  id: string
  baseText: string
  userText: string
}

/** The whole description lineage, held as one draft (D13). */
export type DartDescriptionDraft = {
  base: string
  draft: string
  unresolved: readonly DartDescriptionDraftHunk[]
}

export type DartDraftValue = string | DartDescriptionDraft

type DraftEntry = {
  hostKey: string
  value: DartDraftValue
  dirty: boolean
}

// Insertion order is last-write order, so the first entry of a kind is the oldest. Memory only (D13).
const drafts = new Map<string, DraftEntry>()

/** `identity` is host plus account, so a host switch or a second account never reaches this draft. */
export function dartDraftKey(
  identity: DartAccountIdentity,
  taskId: string,
  kind: DartDraftKind
): string {
  return JSON.stringify([identity.hostKey, identity.accountKey, taskId, kind])
}

/** Where a key from `dartDraftKey` belongs, so a warning can name the draft. */
export function dartDraftKeyParts(key: string): {
  hostKey: string
  taskId: string
  kind: DartDraftKind
} {
  const [hostKey, , taskId, kind]: [string, string, string, DartDraftKind] = JSON.parse(key)
  return { hostKey, taskId, kind }
}

function evictCleanEntries(): void {
  for (const [key, entry] of drafts) {
    if (drafts.size <= MAX_DART_DRAFTS) {
      return
    }
    if (!entry.dirty) {
      drafts.delete(key)
    }
  }
}

function dirtyEntries(): [string, DraftEntry][] {
  return [...drafts].filter(([, entry]) => entry.dirty)
}

export function getDraft(key: string): DartDraftValue | undefined {
  return drafts.get(key)?.value
}

/** `full` means nothing changed: the editor offers the oldest dirty draft to copy and discard first. */
export function setDraft(
  key: string,
  value: DartDraftValue,
  { dirty }: { dirty: boolean }
): 'ok' | 'full' {
  const isNewDirty = dirty && !drafts.get(key)?.dirty
  if (isNewDirty && dirtyEntries().length >= MAX_DART_DRAFTS) {
    return 'full'
  }
  drafts.delete(key)
  drafts.set(key, { hostKey: dartDraftKeyParts(key).hostKey, value, dirty })
  evictCleanEntries()
  return 'ok'
}

export function clearDraft(key: string): void {
  drafts.delete(key)
}

export function oldestDirtyDraft(): { key: string; value: DartDraftValue } | null {
  const oldest = dirtyEntries()[0]
  return oldest ? { key: oldest[0], value: oldest[1].value } : null
}

export function dirtyDraftCount(hostKey: string): number {
  return dirtyEntries().filter(([, entry]) => entry.hostKey === hostKey).length
}

/** The text the user typed in each dirty draft of one host, oldest first; a description also carries its unresolved hunks. */
export function dirtyDraftTexts(hostKey: string): string[] {
  return dirtyEntries()
    .filter(([, entry]) => entry.hostKey === hostKey)
    .map(([, { value }]) =>
      typeof value === 'string'
        ? value
        : [value.draft, ...value.unresolved.map((hunk) => hunk.userText)]
            .filter((text) => text !== '')
            .join('\n\n')
    )
}

export function discardDirtyDrafts(hostKey: string): void {
  for (const [key, entry] of dirtyEntries()) {
    if (entry.hostKey === hostKey) {
      drafts.delete(key)
    }
  }
}
