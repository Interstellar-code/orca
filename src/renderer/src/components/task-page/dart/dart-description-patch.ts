import { diffWordsWithSpace } from 'diff'
import { checkDartRequestText } from '../../../../../shared/dart/dart-text-limits'
import type { DartUpdateTaskDescriptionArgs } from '../../../../../shared/rpc-contract/dart-params'

export type DartDescriptionUpdate = DartUpdateTaskDescriptionArgs['updates'][number]

export type DartDescriptionPatch =
  | { kind: 'patch'; updates: DartDescriptionUpdate[] }
  | { kind: 'refused'; reason: 'empty-base' | 'non-unique-anchor' }
  | {
      kind: 'refused'
      reason: 'too-large'
      size: { amount: number; limit: number; unit: 'characters' | 'bytes' }
    }

/** `base.slice(start, end)` becomes `text`. Offsets are in `base`. */
export type DartDescriptionRegion = { start: number; end: number; text: string }

const MAX_PATCH_UPDATES = 8
// A short anchor also matches a short remote addition, which only costs a refusal, but a longer one narrows the accepted race.
const MIN_ANCHOR_CHARS = 16
// Past this the text is genuinely repetitive; the patch stays targeted instead of growing into a near-full rewrite.
const MAX_WIDEN_CHARS = 4096
// Word diffing a full rewrite is quadratic; past this the whole changed block is one region.
const MAX_DIFF_EDIT_LENGTH = 2000

function commonLineTrim(base: string, draft: string): { head: number; tail: number } {
  const limit = Math.min(base.length, draft.length)
  let equal = 0
  while (equal < limit && base[equal] === draft[equal]) {
    equal += 1
  }
  const head = equal === 0 ? 0 : base.lastIndexOf('\n', equal - 1) + 1
  let tailEqual = 0
  while (
    tailEqual < limit - head &&
    base[base.length - 1 - tailEqual] === draft[draft.length - 1 - tailEqual]
  ) {
    tailEqual += 1
  }
  const fromEnd = base.indexOf('\n', base.length - tailEqual)
  return { head, tail: fromEnd === -1 ? 0 : base.length - fromEnd }
}

/** The changed regions of `base → draft`, in order, split at word boundaries. */
export function describeChangedRegions(base: string, draft: string): DartDescriptionRegion[] {
  if (base === draft) {
    return []
  }
  const { head, tail } = commonLineTrim(base, draft)
  const oldBlock = base.slice(head, base.length - tail)
  const newBlock = draft.slice(head, draft.length - tail)
  const changes = diffWordsWithSpace(oldBlock, newBlock, { maxEditLength: MAX_DIFF_EDIT_LENGTH })
  if (!changes) {
    return [{ start: head, end: base.length - tail, text: newBlock }]
  }
  const regions: DartDescriptionRegion[] = []
  let position = head
  let open: DartDescriptionRegion | null = null
  for (const change of changes) {
    if (!change.added && !change.removed) {
      open = null
      position += change.value.length
      continue
    }
    open ??= regions[regions.push({ start: position, end: position, text: '' }) - 1]
    if (change.added) {
      open.text += change.value
    } else {
      position += change.value.length
      open.end = position
    }
  }
  return regions
}

function isUnique(doc: string, text: string): boolean {
  const first = doc.indexOf(text)
  return first !== -1 && !doc.includes(text, first + 1)
}

// A lone surrogate does not survive the JSON trip to Dart.
function alignStart(doc: string, index: number): number {
  const code = doc.charCodeAt(index)
  return index > 0 && code >= 0xdc00 && code <= 0xdfff ? index - 1 : index
}

function alignEnd(doc: string, index: number): number {
  const code = doc.charCodeAt(index - 1)
  return index < doc.length && code >= 0xd800 && code <= 0xdbff ? index + 1 : index
}

function widen(
  doc: string,
  start: number,
  end: number,
  direction: 'before' | 'after' | 'both',
  initial: number
): { start: number; end: number } | null {
  let growth = initial
  for (;;) {
    const left = direction === 'after' ? start : alignStart(doc, Math.max(0, start - growth))
    const right = direction === 'before' ? end : alignEnd(doc, Math.min(doc.length, end + growth))
    if (right > left && isUnique(doc, doc.slice(left, right))) {
      return { start: left, end: right }
    }
    const reachedEdges =
      (direction === 'after' || left === 0) && (direction === 'before' || right === doc.length)
    if (reachedEdges || growth >= MAX_WIDEN_CHARS) {
      return null
    }
    growth = Math.min(MAX_WIDEN_CHARS, Math.max(8, growth * 2))
  }
}

function replaceWithContext(
  doc: string,
  { start, end, text }: DartDescriptionRegion
): DartDescriptionUpdate | null {
  const span = widen(doc, start, end, 'both', 0)
  return (
    span && {
      type: 'replace',
      oldText: doc.slice(span.start, span.end),
      newText: doc.slice(span.start, start) + text + doc.slice(end, span.end)
    }
  )
}

function buildInsert(doc: string, region: DartDescriptionRegion): DartDescriptionUpdate | null {
  const { start, text } = region
  const before = start > 0 ? widen(doc, start, start, 'before', MIN_ANCHOR_CHARS) : null
  if (before) {
    return { type: 'insert_after', anchorText: doc.slice(before.start, start), newText: text }
  }
  const after = start < doc.length ? widen(doc, start, start, 'after', MIN_ANCHOR_CHARS) : null
  if (after) {
    return { type: 'insert_before', anchorText: doc.slice(start, after.end), newText: text }
  }
  return replaceWithContext(doc, region)
}

function buildUpdate(doc: string, region: DartDescriptionRegion): DartDescriptionUpdate | null {
  if (region.start === region.end) {
    return buildInsert(doc, region)
  }
  const oldText = doc.slice(region.start, region.end)
  // A `delete` takes no newText, so a removal that needs context to be unique has to be a `replace`.
  return region.text === '' && isUnique(doc, oldText)
    ? { type: 'delete', oldText }
    : replaceWithContext(doc, region)
}

function collapseRegions(
  regions: DartDescriptionRegion[],
  base: string,
  draft: string
): DartDescriptionRegion[] {
  if (regions.length <= MAX_PATCH_UPDATES) {
    return regions
  }
  const start = regions[0].start
  const end = regions.at(-1)!.end
  return [{ start, end, text: draft.slice(start, draft.length - (base.length - end)) }]
}

/** Never carries `occurrence`: Dart applies the updates in order, so they run from the end of the text to its start, each checked against the text as it will stand. An empty `updates` means nothing changed. */
export function buildDescriptionUpdates(base: string, draft: string): DartDescriptionPatch {
  if (!base.trim()) {
    return { kind: 'refused', reason: 'empty-base' }
  }
  const regions = collapseRegions(describeChangedRegions(base, draft), base, draft)
  const updates: DartDescriptionUpdate[] = []
  let doc = base
  for (const region of regions.toReversed()) {
    const update = buildUpdate(doc, region)
    if (!update) {
      return { kind: 'refused', reason: 'non-unique-anchor' }
    }
    updates.push(update)
    doc = doc.slice(0, region.start) + region.text + doc.slice(region.end)
  }
  if (doc !== draft) {
    return { kind: 'refused', reason: 'non-unique-anchor' }
  }
  const texts = updates
    .flatMap((update) => [update.oldText, update.anchorText, update.newText])
    .filter((text) => text !== undefined)
  const size = checkDartRequestText('descriptionPatch', texts)
  return size.ok
    ? { kind: 'patch', updates }
    : {
        kind: 'refused',
        reason: 'too-large',
        size: { amount: size.size, limit: size.limit, unit: size.unit }
      }
}

export function textareaText(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

function splitKeepingLineEndings(text: string): { text: string; ending: string }[] {
  const lines: { text: string; ending: string }[] = []
  let start = 0
  for (const match of text.matchAll(/\r\n?|\n/g)) {
    lines.push({ text: text.slice(start, match.index), ending: match[0] })
    start = match.index + match[0].length
  }
  lines.push({ text: text.slice(start), ending: '' })
  return lines
}

/** A textarea reports every line ending as LF; lines outside the edit keep what Dart holds, or each would count as a change. */
export function restoreBaseLineEndings(base: string, edited: string): string {
  if (!base.includes('\r')) {
    return edited
  }
  const baseLines = splitKeepingLineEndings(base)
  const editedLines = edited.split('\n')
  const limit = Math.min(baseLines.length, editedLines.length)
  let head = 0
  while (head < limit && baseLines[head].text === editedLines[head]) {
    head += 1
  }
  let tail = 0
  while (
    tail < limit - head &&
    baseLines[baseLines.length - 1 - tail].text === editedLines[editedLines.length - 1 - tail]
  ) {
    tail += 1
  }
  const nearestEnding =
    baseLines.slice(0, head).findLast((line) => line.ending)?.ending ??
    baseLines.find((line) => line.ending)?.ending ??
    '\n'
  const replacedCount = baseLines.length - head - tail
  const middle = editedLines.slice(head, editedLines.length - tail).map((text, index) => ({
    text,
    ending: index < replacedCount ? baseLines[head + index].ending : ''
  }))
  const lines = [
    ...baseLines.slice(0, head),
    ...middle,
    ...baseLines.slice(baseLines.length - tail)
  ]
  return lines
    .map((line, index) =>
      index === lines.length - 1 ? line.text : line.text + (line.ending || nearestEnding)
    )
    .join('')
}
