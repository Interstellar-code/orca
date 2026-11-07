import { describe, expect, it } from 'vitest'
import type { DartScopeMeta } from './dart-board-contracts'
import { buildDartCountLine } from './task-page-dart-list-model'

const meta = (overrides: Partial<DartScopeMeta>): DartScopeMeta => ({
  openTotal: 120,
  doneTotal: 80,
  doneOffset: 50,
  generation: 1,
  fetchedAt: 1,
  incomplete: false,
  partialReason: null,
  ...overrides
})

describe('buildDartCountLine', () => {
  it('reads "N open of M · K latest done" under the cap', () => {
    const line = buildDartCountLine({
      meta: meta({}),
      loadedOpen: 120,
      loadedDone: 50,
      clientFilterActive: false
    })

    expect(line.text).toBe('120 open of 120 · 50 latest done')
    expect(line.offersRefresh).toBe(false)
  })

  it('tells the user to narrow past 1,000 open tasks, or that a filter sees only the first 1,000', () => {
    const cut = meta({ openTotal: 1_400 })

    expect(
      buildDartCountLine({ meta: cut, loadedOpen: 1_000, loadedDone: 0, clientFilterActive: false })
        .text
    ).toBe('Showing 1,000 of 1,400 open tasks. Pick a dartboard, Mine or search to narrow.')
    expect(
      buildDartCountLine({ meta: cut, loadedOpen: 12, loadedDone: 0, clientFilterActive: true })
        .text
    ).toBe('Filtering the first 1,000 of 1,400 open tasks.')
  })

  it('says Dart changed during an incomplete read and offers a refresh', () => {
    const line = buildDartCountLine({
      meta: meta({ incomplete: true }),
      loadedOpen: 118,
      loadedDone: 50,
      clientFilterActive: false
    })

    expect(line).toEqual({
      text: 'About 118 open tasks (Dart changed during the read) ·',
      offersRefresh: true
    })
  })
})
