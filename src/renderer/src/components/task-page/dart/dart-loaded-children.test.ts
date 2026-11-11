import { describe, expect, it } from 'vitest'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import { collectDartChildrenEntries, reconcileDartTasks } from './dart-loaded-children'

function task(id: string, overrides: Partial<DartTask> = {}): DartTask {
  return { id, title: id, htmlUrl: `https://app.dartai.com/t/${id}`, tags: [], ...overrides }
}

const OLD = '2026-01-01T00:00:00Z'
const NEW = '2026-02-01T00:00:00Z'

describe('reconcileDartTasks', () => {
  it('keeps the newest copy across scope rows and entries', () => {
    const set = reconcileDartTasks(
      [task('a', { title: 'old', updatedAt: OLD })],
      [[task('a', { title: 'new', updatedAt: NEW })]]
    )
    expect(set.newestOf(task('a')).title).toBe('new')
    expect(set.topLevel.map((row) => row.title)).toEqual(['new'])
  })

  it('drops a scope row from the top level when a newer cached copy has a parent, and counts it once there', () => {
    const set = reconcileDartTasks(
      [task('a'), task('b'), task('kid', { updatedAt: OLD })],
      [[task('kid', { parentId: 'b', updatedAt: NEW })]]
    )
    expect(set.topLevel.map((row) => row.id)).toEqual(['a', 'b'])
    expect(set.childrenOf('b').map((row) => row.id)).toEqual(['kid'])
    expect(set.childrenOf('a')).toEqual([])
  })

  it('counts a child under the parent of its newest copy even when that parent is not listed', () => {
    const set = reconcileDartTasks(
      [task('kid', { updatedAt: OLD })],
      [[task('kid', { parentId: 'unlisted', updatedAt: NEW })]]
    )
    expect(set.topLevel).toEqual([])
    expect(set.childrenOf('unlisted').map((row) => row.id)).toEqual(['kid'])
  })

  it('never promotes a cache-only task to the top level', () => {
    const set = reconcileDartTasks([task('a')], [[task('cached'), task('kid', { parentId: 'a' })]])
    expect(set.topLevel.map((row) => row.id)).toEqual(['a'])
    expect([...set.scopeIds]).toEqual(['a'])
    expect(set.childrenOf('a').map((row) => row.id)).toEqual(['kid'])
  })

  it('keeps the first copy on a tie or a missing updatedAt, scope rows first', () => {
    const set = reconcileDartTasks(
      [task('a', { title: 'scope', updatedAt: OLD }), task('b', { title: 'scope' })],
      [[task('a', { title: 'cache', updatedAt: OLD }), task('b', { title: 'cache' })]]
    )
    expect(set.newestOf(task('a')).title).toBe('scope')
    expect(set.newestOf(task('b')).title).toBe('scope')
  })

  it('lets a timestamped copy replace one without a timestamp', () => {
    const set = reconcileDartTasks(
      [task('a', { title: 'bare' })],
      [[task('a', { title: 'dated', updatedAt: OLD })]]
    )
    expect(set.newestOf(task('a')).title).toBe('dated')
  })
})

describe('collectDartChildrenEntries', () => {
  it('takes every read entry under the prefix and skips other keys and unread entries', () => {
    const cache = {
      'scope::list::children::p1': { data: { tasks: [task('a')] } },
      'scope::list::children::p2': { data: { tasks: [task('b')] } },
      'scope::list::children::p3': { data: null },
      'scope::list': { data: { tasks: [task('c')] } },
      'other::list::children::p1': { data: { tasks: [task('d')] } }
    }
    expect(
      collectDartChildrenEntries(cache, 'scope::list::children::').map((tasks) => tasks[0].id)
    ).toEqual(['a', 'b'])
  })
})
