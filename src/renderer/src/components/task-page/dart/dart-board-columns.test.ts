import { describe, expect, it } from 'vitest'
import type {
  DartTask,
  DartTaskRelationships,
  DartWorkspaceConfig
} from '../../../../../shared/dart/dart-types'
import {
  applyDartBoardFilters,
  buildDartBoardColumns,
  buildDartCardInfo,
  dartRelationshipEntryFor,
  hasDartOnHoldOption,
  isDartTaskFinished,
  isDartTaskOnHold
} from './dart-board-columns'
import type { DartClientFilters, DartRelationshipCacheEntry } from './dart-board-contracts'

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

  it('gives one column when /config repeats a status in a different letter case', () => {
    const columns = buildDartBoardColumns(
      [task('a', { status: 'doing' })],
      config({ statuses: ['Doing', 'DOING'] }),
      shown
    )
    expect(columns.map((c) => c.status)).toEqual(['Doing'])
    expect(columns[0].tasks.map((t) => t.id)).toEqual(['a'])
  })

  it('puts tasks without a status in one last column that is not in /config', () => {
    const columns = buildDartBoardColumns(
      [
        task('a', { status: null }),
        task('b', { status: 'Doing' }),
        task('c', { status: '' }),
        task('d', { status: 'Alien' }),
        task('e')
      ],
      config({ statuses: ['Doing'] }),
      hidden
    )
    expect(columns.map((c) => [c.status, c.inConfig])).toEqual([
      ['Doing', true],
      ['Alien', false],
      ['', false]
    ])
    const last = columns[2]
    expect(last.tasks.map((t) => t.id)).toEqual(['a', 'c', 'e'])
    expect(last.count).toBe(3)
    expect(new Set(columns.map((c) => c.key)).size).toBe(3)
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
    expect(hasDartOnHoldOption(config({ statuses: ['On hold'], tags: ['on-hold'] }))).toBe(true)
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

describe('nested board columns', () => {
  const cfg = config({ statuses: ['Doing'] })
  const tasks = [
    task('p', { status: 'Doing' }),
    task('c1', { status: 'Doing', parentId: 'p' }),
    task('c2', { status: 'Doing', parentId: 'p' })
  ]

  it('keeps every task a card when nested is false or absent', () => {
    for (const opts of [hidden, { ...hidden, nested: false }]) {
      expect(buildDartBoardColumns(tasks, cfg, opts)[0].tasks.map((t) => t.id)).toEqual([
        'p',
        'c1',
        'c2'
      ])
    }
  })

  it('leaves out every task with a parentId when nested is true', () => {
    const columns = buildDartBoardColumns(tasks, cfg, { ...hidden, nested: true })
    expect(columns[0].tasks.map((t) => t.id)).toEqual(['p'])
    expect(columns[0].count).toBe(1)
  })

  it('counts the loaded subtasks on the parent card', () => {
    expect(buildDartCardInfo(tasks[0], undefined, tasks.slice(1)).subtasks).toEqual({
      loaded: 2,
      total: null
    })
  })
})

function relationshipEntry(
  state: DartRelationshipCacheEntry['state'],
  overrides: Partial<DartTaskRelationships> | null = {}
): DartRelationshipCacheEntry {
  return {
    state,
    relationships: overrides
      ? {
          subtaskIds: [],
          blockerIds: [],
          blockingIds: [],
          duplicateIds: [],
          relatedIds: [],
          ...overrides
        }
      : null,
    fetchedAt: 1,
    error: state === 'error' ? 'boom' : null
  }
}

describe('buildDartCardInfo relationships', () => {
  const held = task('h', { status: 'On hold' })

  it('returns exactly the release A card without relationships or children', () => {
    expect(buildDartCardInfo(held)).toStrictEqual({ task: held, onHold: true })
  })

  it('counts blockers and blocking for a known on-hold task', () => {
    const blocked = buildDartCardInfo(held, relationshipEntry('known', { blockerIds: ['x', 'y'] }))
    expect([blocked.relationshipState, blocked.blockedBy, blocked.blocking]).toEqual([
      'known',
      2,
      0
    ])
    const blocking = buildDartCardInfo(held, relationshipEntry('known', { blockingIds: ['z'] }))
    expect([blocking.blockedBy, blocking.blocking]).toEqual([0, 1])
    const both = buildDartCardInfo(
      held,
      relationshipEntry('known', { blockerIds: ['x'], blockingIds: ['y', 'z'] })
    )
    expect([both.blockedBy, both.blocking]).toEqual([1, 2])
  })

  it('reports null counts, never 0, when not known', () => {
    for (const state of ['notChecked', 'loading', 'error'] as const) {
      const info = buildDartCardInfo(held, relationshipEntry(state, null))
      expect([info.relationshipState, info.blockedBy, info.blocking]).toEqual([state, null, null])
    }
  })

  it('ignores the relationships entry on a task that is not on hold', () => {
    const info = buildDartCardInfo(
      task('n', { status: 'Doing' }),
      relationshipEntry('known', { blockerIds: ['x'] })
    )
    expect(info).toStrictEqual({
      task: info.task,
      onHold: false,
      subtasks: { loaded: 0, total: 0 }
    })
  })

  it('takes the subtask total from subtaskIds when known', () => {
    const child = task('c', { parentId: 'h' })
    const info = buildDartCardInfo(
      held,
      relationshipEntry('known', { subtaskIds: ['c', 'd', 'e'] }),
      [child]
    )
    expect(info.subtasks).toEqual({ loaded: 1, total: 3 })
  })
})

describe('applyDartBoardFilters blockedOnHold', () => {
  const blockedFilter: DartClientFilters = { ...noFilters, blockedOnHold: true }
  const blocked = task('blocked', { status: 'On hold' })
  const unblocked = task('unblocked', { status: 'On hold' })
  const missing = task('missing', { status: 'On hold' })
  const notChecked = task('notChecked', { tags: ['on-hold'] })
  const loading = task('loading', { tags: ['on-hold'] })
  const failed = task('failed', { tags: ['on-hold'] })
  const knownNull = task('knownNull', { tags: ['on-hold'] })
  const active = task('active', { status: 'Doing' })
  const activeBlocked = task('activeBlocked', { status: 'Doing' })
  const relationships = new Map<string, DartRelationshipCacheEntry>([
    ['blocked', relationshipEntry('known', { blockerIds: ['x'] })],
    ['unblocked', relationshipEntry('known', { blockingIds: ['x'] })],
    ['notChecked', relationshipEntry('notChecked', null)],
    ['loading', relationshipEntry('loading', null)],
    ['failed', relationshipEntry('error', null)],
    ['knownNull', relationshipEntry('known', null)],
    ['activeBlocked', relationshipEntry('known', { blockerIds: ['x'] })]
  ])

  it('keeps blocked and not-checked on-hold tasks, drops known-unblocked and non-on-hold', () => {
    const all = [
      blocked,
      unblocked,
      missing,
      notChecked,
      loading,
      failed,
      knownNull,
      active,
      activeBlocked
    ]
    expect(applyDartBoardFilters(all, blockedFilter, relationships).map((t) => t.id)).toEqual([
      'blocked',
      'missing',
      'notChecked',
      'loading',
      'failed',
      'knownNull'
    ])
  })

  it('has no effect when blockedOnHold is absent or false', () => {
    const all = [unblocked, active]
    expect(applyDartBoardFilters(all, noFilters, relationships)).toEqual(all)
    expect(
      applyDartBoardFilters(all, { ...noFilters, blockedOnHold: false }, relationships)
    ).toEqual(all)
  })
})

describe('dartRelationshipEntryFor', () => {
  const held = task('held', { status: 'On hold' })
  const synthetic = { state: 'notChecked', relationships: null, fetchedAt: 0, error: null }

  it('gives a missing on-hold task on a relationships host a notChecked entry', () => {
    const entry = dartRelationshipEntryFor(held, new Map(), true)
    expect(entry).toEqual(synthetic)
    const info = buildDartCardInfo(held, entry)
    expect([info.relationshipState, info.blockedBy, info.blocking]).toEqual([
      'notChecked',
      null,
      null
    ])
    const map = new Map<string, DartRelationshipCacheEntry>()
    const other = task('other', { status: 'Doing' })
    for (const t of [held, other]) {
      const e = dartRelationshipEntryFor(t, undefined, true)
      if (e) {
        map.set(t.id, e)
      }
    }
    const kept = applyDartBoardFilters([held, other], { ...noFilters, blockedOnHold: true }, map)
    expect(kept.map((t) => t.id)).toEqual(['held'])
  })

  it('returns undefined for a task not on hold, keeping the release A card', () => {
    const active = task('active', { status: 'Doing' })
    const entry = dartRelationshipEntryFor(active, new Map(), true)
    expect(entry).toBeUndefined()
    expect(buildDartCardInfo(active, entry)).toStrictEqual({ task: active, onHold: false })
  })

  it('returns undefined on a non-relationships host even when on hold', () => {
    expect(dartRelationshipEntryFor(held, new Map(), false)).toBeUndefined()
    expect(dartRelationshipEntryFor(held, undefined, false)).toBeUndefined()
  })

  it('returns a cached entry as-is so known stays known', () => {
    const known = relationshipEntry('known', { blockerIds: ['x'] })
    expect(dartRelationshipEntryFor(held, new Map([['held', known]]), true)).toBe(known)
    expect(dartRelationshipEntryFor(held, new Map([['held', known]]), false)).toBe(known)
  })
})
