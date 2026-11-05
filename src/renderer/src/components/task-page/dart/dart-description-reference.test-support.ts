import { expect } from 'vitest'
import type { DartDescriptionUpdate } from './dart-description-patch'

export class DartRefused extends Error {}

function occurrences(doc: string, text: string): number {
  let count = 0
  for (let at = doc.indexOf(text); at !== -1; at = doc.indexOf(text, at + 1)) {
    count += 1
  }
  return count
}

/** Dart's rules from its spec: in order, each on the last result, and with no `occurrence` the target must be unique. */
export function applyLikeDart(doc: string, updates: readonly DartDescriptionUpdate[]): string {
  let current = doc
  for (const update of updates) {
    expect(update).not.toHaveProperty('occurrence')
    const target =
      update.type === 'replace' || update.type === 'delete' ? update.oldText : update.anchorText
    if (!target || occurrences(current, target) !== 1) {
      throw new DartRefused(`not unique: ${update.type}`)
    }
    const at = current.indexOf(target)
    const end = at + target.length
    switch (update.type) {
      case 'replace':
        current = current.slice(0, at) + update.newText + current.slice(end)
        break
      case 'delete':
        expect(update).not.toHaveProperty('newText')
        current = current.slice(0, at) + current.slice(end)
        break
      case 'insert_before':
        current = current.slice(0, at) + update.newText + current.slice(at)
        break
      case 'insert_after':
        current = current.slice(0, end) + update.newText + current.slice(end)
        break
    }
  }
  return current
}
