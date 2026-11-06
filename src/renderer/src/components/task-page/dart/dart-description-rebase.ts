import type { DartDescriptionDraftHunk } from './dart-draft-store'
import { describeChangedRegions, type DartDescriptionRegion } from './dart-description-patch'
import type { DartDescriptionLineage } from './dart-description-save-flow'

export type DartDescriptionRebase = {
  merged: string
  unresolved: DartDescriptionDraftHunk[]
}

const CONTEXT_CHARS = 32

// Memory only (D13), so a session counter is unique across every lineage.
let nextHunkId = 0

function isLineBreak(char: string | undefined): boolean {
  return char === '\n' || char === '\r'
}

// Context stays on the hunk's own line: a remote addition between two paragraphs is not a change to either one.
function lineContextBefore(base: string, start: number): { text: string; whole: boolean } {
  let from = start
  while (from > 0 && start - from < CONTEXT_CHARS && !isLineBreak(base[from - 1])) {
    from -= 1
  }
  return { text: base.slice(from, start), whole: from === 0 || isLineBreak(base[from - 1]) }
}

function lineContextAfter(base: string, end: number): { text: string; whole: boolean } {
  let to = end
  while (to < base.length && to - end < CONTEXT_CHARS && !isLineBreak(base[to])) {
    to += 1
  }
  return { text: base.slice(end, to), whole: to === base.length || isLineBreak(base[to]) }
}

function uniqueIndex(text: string, needle: string): number {
  const first = text.indexOf(needle)
  return first !== -1 && !text.includes(needle, first + 1) ? first : -1
}

/** Where the region's change lands in `latest`, or null when its text and neighbours are not there exactly once. */
function locate(
  base: string,
  latest: string,
  region: DartDescriptionRegion
): { start: number; end: number } | null {
  const before = lineContextBefore(base, region.start)
  const after = lineContextAfter(base, region.end)
  const removed = base.slice(region.start, region.end)
  const needle = before.text + removed + after.text
  if (!needle.trim()) {
    return null
  }
  const at = uniqueIndex(latest, needle)
  if (at === -1) {
    return null
  }
  const needleEnd = at + needle.length
  const lineStillStarts = !before.whole || at === 0 || isLineBreak(latest[at - 1])
  const lineStillEnds =
    !after.whole || needleEnd === latest.length || isLineBreak(latest[needleEnd])
  if (!lineStillStarts || !lineStillEnds) {
    return null
  }
  const start = at + before.text.length
  return { start, end: start + removed.length }
}

/** Applies each hunk of `base → draft` whose text is still there exactly once; the rest are returned and never applied. */
export function rebaseDraft(base: string, draft: string, latest: string): DartDescriptionRebase {
  if (latest === draft) {
    return { merged: latest, unresolved: [] }
  }
  const regions = describeChangedRegions(base, draft).map((region) => ({
    region,
    target: locate(base, latest, region)
  }))
  const placed = regions
    .filter((entry) => entry.target !== null)
    .toSorted((a, b) => a.target!.start - b.target!.start)
  const applied = new Set<DartDescriptionRegion>()
  let merged = ''
  let cursor = 0
  for (const { region, target } of placed) {
    if (target!.start < cursor) {
      continue
    }
    merged += latest.slice(cursor, target!.start) + region.text
    cursor = target!.end
    applied.add(region)
  }
  merged += latest.slice(cursor)
  const unresolved = regions
    .filter(({ region }) => !applied.has(region))
    .map(({ region }) => ({
      id: `description-hunk-${(nextHunkId += 1)}`,
      baseText: base.slice(region.start, region.end),
      userText: region.text
    }))
  return { merged, unresolved }
}

/** "Back to editing": `latest` becomes the base; stored hunks are carried, never retried. */
export function rebaseDescriptionLineage(
  lineage: DartDescriptionLineage,
  latest: string
): DartDescriptionLineage {
  const { merged, unresolved } = rebaseDraft(lineage.base, lineage.draft, latest)
  return {
    ...lineage,
    base: latest,
    draft: merged,
    unresolved: [...lineage.unresolved, ...unresolved]
  }
}
