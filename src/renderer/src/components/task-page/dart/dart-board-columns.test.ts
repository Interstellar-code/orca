import { describe, expect, it } from 'vitest'
import type { DartTask, DartWorkspaceConfig } from '../../../../../shared/dart/dart-types'
import {
  applyDartBoardFilters,
  buildDartBoardColumns,
  buildDartCardInfo,
  hasDartOnHoldOption,
  isDartTaskFinished,
  isDartTaskOnHold
} from './dart-board-columns'
import type { DartClientFilters } from './dart-board-contracts'

function task(id: string, overrides: Partial<DartTask> = {}): DartTask {
  return {
    id,
    title: `Task ${id}`,
    htmlUrl: `https://app.dartai.com/t/${id}`,
    tags: [],
    ...overrides
  }
}

function config(overrides: Partial<DartWorkspaceConfig> = {}): DartWorkspaceConfig {
  return {
    dartboards: [],
    statuses: [],
    types: [],
    tags: [],
    priorities: [],
    sizes: [],
    assignees: [],
    ...overrides
  }
}

const noFilters: DartClientFilters = { status: null, tag: null, priority: null, onHold: false }
const hidden = { showEmptyColumns: false }
const shown = { showEmptyColumns: true }

describe('isDartTaskFinished', () => {
  it('is true for a completedAt date string', () => {
    expect(isDartTaskFinished(task('a', { completedAt: '2026-01-02T00:00:00Z' }))).toBe(true)
  })

  it('is false for null, empty and missing completedAt', () => {
    expect(isDartTaskFinished(task('a', { completedAt: null }))).toBe(false)
    expect(isDartTaskFinished(task('b', { completedAt: '' }))).toBe(false)
    expect(isDartTaskFinished(task('c'))).toBe(false)
  })
})

describe('buildDartBoardColumns', () => {
  const cfg = config({ statuses: ['To-do', 'Doing', 'Done'] })

  it('orders columns by /config status order, not task order', () => {
    const columns = buildDartBoardColumns(
      [
        task('a', { status: 'Done' }),
        task('b', { status: 'To-do' }),
        task('c', { status: 'Doing' })
      ],
      cfg,
      hidden
    )
    expect(columns.map((c) => c.status)).toEqual(['To-do', 'Doing', 'Done'])
    expect(columns.every((c) => c.inConfig)).toBe(true)
  })

  it('omits statuses no task carries when empty columns are hidden', () => {
    const columns = buildDartBoardColumns([task('a', { status: 'Doing' })], cfg, hidden)
    expect(columns.map((c) => c.status)).toEqual(['Doing'])
  })

  it('puts statuses unknown to /config last, named as the task gives them', () => {
    const columns = buildDartBoardColumns(
      [
        task('a', { status: 'Weird State' }),
        task('b', { status: 'Done' }),
        task('c', { status: 'To-do' })
      ],
      cfg,
      hidden
    )
    expect(columns.map((c) => c.status)).toEqual(['To-do', 'Done', 'Weird State'])
    expect(columns.map((c) => c.inConfig)).toEqual([true, true, false])
  })

  it('turns every task status into an out-of-config column when /config is empty', () => {
    const columns = buildDartBoardColumns(
      [
        task('a', { status: 'Alpha' }),
        task('b', { status: 'Beta' }),
        task('c', { status: 'Alpha' })
      ],
      config(),
      hidden
    )
    expect(columns.map((c) => [c.status, c.inConfig, c.count])).toEqual([
      ['Alpha', false, 2],
      ['Beta', false, 1]
    ])
  })

  it('gives one column and unique keys when /config repeats a status', () => {
    const columns = buildDartBoardColumns(
      [task('a', { status: 'Doing' })],
      config({ statuses: ['Doing', 'Doing', 'Done'] }),
      shown
    )
    expect(columns.map((c) => c.status)).toEqual(['Doing', 'Done'])
    expect(new Set(columns.map((c) => c.key)).size).toBe(columns.length)
  })

  it('matches a task status case-insensitively and shows the /config spelling', () => {
    const columns = buildDartBoardColumns(
      [task('a', { status: 'doing' }), task('b', { status: 'DOING' })],
      cfg,
      hidden
    )
    expect(columns).toHaveLength(1)
    expect(columns[0].status).toBe('Doing')
    expect(columns[0].inConfig).toBe(true)
    expect(columns[0].tasks.map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('reports count equal to the number of tasks in the column', () => {
    const columns = buildDartBoardColumns(
      [
        task('a', { status: 'Doing' }),
        task('b', { status: 'Doing' }),
        task('c', { status: 'Done' })
      ],
      cfg,
      shown
    )
    for (const column of columns) {
      expect(column.count).toBe(column.tasks.length)
    }
    expect(columns.find((c) => c.status === 'Doing')?.count).toBe(2)
  })

  it('produces unique keys that are identical for identical input', () => {
    const tasks = [
      task('a', { status: 'Doing' }),
      task('b', { status: 'Mystery' }),
      task('c', { status: 'Done' })
    ]
    const first = buildDartBoardColumns(tasks, cfg, shown)
    const second = buildDartBoardColumns(tasks, cfg, shown)
    expect(new Set(first.map((c) => c.key)).size).toBe(first.length)
    expect(second.map((c) => c.key)).toEqual(first.map((c) => c.key))
  })

  it('adds the remaining /config statuses as empty columns in /config order when shown', () => {
    const columns = buildDartBoardColumns([task('a', { status: 'Doing' })], cfg, shown)
    expect(columns.map((c) => [c.status, c.count])).toEqual([
      ['To-do', 0],
      ['Doing', 1],
      ['Done', 0]
    ])
    expect(columns[0].tasks).toEqual([])
  })

  it('keeps read order for open tasks and lists finished ones after, newest first, ties by id', () => {
    const columns = buildDartBoardColumns(
      [
        task('f1', { status: 'Done', completedAt: '2026-01-01T00:00:00Z' }),
        task('o2', { status: 'Done' }),
        task('f3', { status: 'Done', completedAt: '2026-03-01T00:00:00Z' }),
        task('o1', { status: 'Done', completedAt: null }),
        task('f2b', { status: 'Done', completedAt: '2026-02-01T00:00:00Z' }),
        task('f2a', { status: 'Done', completedAt: '2026-02-01T00:00:00Z' }),
        task('o3', { status: 'Done', completedAt: '' })
      ],
      cfg,
      hidden
    )
    expect(columns[0].tasks.map((t) => t.id)).toEqual(['o2', 'o1', 'o3', 'f3', 'f2a', 'f2b', 'f1'])
  })
})

describe('on hold', () => {
  const holdCfg = config({ statuses: ['Doing', 'On hold'], tags: ['on-hold'] })
  const statusOnly = task('s', { status: 'On hold' })
  const tagOnly = task('t', { status: 'Doing', tags: ['on-hold'] })
  const both = task('b', { status: 'On hold', tags: ['on-hold'] })
  const neither = task('n', { status: 'Doing', tags: ['other'] })

  it('treats status-only, tag-only and both as on hold, and neither as not', () => {
    expect(isDartTaskOnHold(statusOnly)).toBe(true)
    expect(isDartTaskOnHold(tagOnly)).toBe(true)
    expect(isDartTaskOnHold(both)).toBe(true)
    expect(isDartTaskOnHold(neither)).toBe(false)
  })

  it('matches the status and tag in any letter case', () => {
    expect(isDartTaskOnHold(task('a', { status: 'ON HOLD' }))).toBe(true)
    expect(isDartTaskOnHold(task('b', { status: 'on hold' }))).toBe(true)
    expect(isDartTaskOnHold(task('c', { tags: ['x', 'ON-HOLD'] }))).toBe(true)
  })

  it('detects the on-hold option from /config statuses or tags, case-insensitively', () => {
    expect(hasDartOnHoldOption(config({ statuses: ['Doing', 'ON HOLD'] }))).toBe(true)
    expect(hasDartOnHoldOption(config({ tags: ['On-Hold'] }))).toBe(true)
    expect(hasDartOnHoldOption(config({ statuses: ['Doing'], tags: ['bug'] }))).toBe(false)
  })

  it('creates the On hold column only for tasks carrying that status', () => {
    const withStatus = buildDartBoardColumns([statusOnly, neither], holdCfg, hidden)
    expect(withStatus.map((c) => c.status)).toEqual(['Doing', 'On hold'])

    const tagOnlyColumns = buildDartBoardColumns([tagOnly], holdCfg, hidden)
    expect(tagOnlyColumns.map((c) => c.status)).toEqual(['Doing'])
    expect(tagOnlyColumns[0].tasks.map((t) => t.id)).toEqual(['t'])
  })

  it('shows an empty On hold column only when empty columns are on and /config has the status', () => {
    expect(buildDartBoardColumns([neither], holdCfg, shown).map((c) => c.status)).toEqual([
      'Doing',
      'On hold'
    ])
    const noHoldStatus = config({ statuses: ['Doing'], tags: ['on-hold'] })
    expect(buildDartBoardColumns([neither], noHoldStatus, shown).map((c) => c.status)).toEqual([
      'Doing'
    ])
  })

  it('returns the same task with the matching onHold flag from buildDartCardInfo', () => {
    for (const [t, onHold] of [
      [statusOnly, true],
      [tagOnly, true],
      [both, true],
      [neither, false]
    ] as const) {
      const info = buildDartCardInfo(t)
      expect(info.task).toBe(t)
      expect(info.onHold).toBe(onHold)
    }
  })
})

describe('applyDartBoardFilters', () => {
  const tasks = [
    task('a', { status: 'Doing', priority: 'High', tags: ['Bug'] }),
    task('b', { status: 'Done', priority: 'Low', tags: ['feature'] }),
    task('c', { status: 'On hold', priority: 'high', tags: ['bug'] }),
    task('d', { status: 'Doing', priority: null, tags: ['on-hold'] })
  ]
  const ids = (list: DartTask[]): string[] => list.map((t) => t.id)

  it('filters by status case-insensitively', () => {
    expect(ids(applyDartBoardFilters(tasks, { ...noFilters, status: 'doing' }))).toEqual(['a', 'd'])
  })

  it('filters by tag case-insensitively', () => {
    expect(ids(applyDartBoardFilters(tasks, { ...noFilters, tag: 'BUG' }))).toEqual(['a', 'c'])
  })

  it('filters by priority case-insensitively', () => {
    expect(ids(applyDartBoardFilters(tasks, { ...noFilters, priority: 'HIGH' }))).toEqual([
      'a',
      'c'
    ])
  })

  it('keeps only on-hold tasks when onHold is true', () => {
    expect(ids(applyDartBoardFilters(tasks, { ...noFilters, onHold: true }))).toEqual(['c', 'd'])
  })

  it('keeps everything when filters are null and onHold is false', () => {
    expect(ids(applyDartBoardFilters(tasks, noFilters))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('combines filters with AND', () => {
    const result = applyDartBoardFilters(tasks, {
      status: 'doing',
      tag: 'bug',
      priority: 'high',
      onHold: false
    })
    expect(ids(result)).toEqual(['a'])
    expect(ids(applyDartBoardFilters(tasks, { ...noFilters, tag: 'bug', onHold: true }))).toEqual([
      'c'
    ])
  })

  it('does not mutate the input array', () => {
    const input = [...tasks]
    applyDartBoardFilters(input, { ...noFilters, status: 'Doing' })
    expect(input).toEqual(tasks)
    expect(input).toHaveLength(4)
  })
})
