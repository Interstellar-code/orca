import { describe, expect, it } from 'vitest'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import { buildDartTaskTree } from './dart-task-tree'

function task(id: string, overrides: Partial<DartTask> = {}): DartTask {
  return {
    id,
    title: `Task ${id}`,
    htmlUrl: `https://app.dartai.com/t/${id}`,
    tags: [],
    ...overrides
  }
}

const noChildren = new Map<string, readonly DartTask[]>()

function shape(tasks: readonly DartTask[], children = noChildren) {
  const { rows, hiddenSubtasks } = buildDartTaskTree(tasks, children, { nested: true })
  return { rows: rows.map((row) => [row.task.id, row.depth, row.parentId]), hiddenSubtasks }
}

describe('buildDartTaskTree', () => {
  it('keeps a flat list with no hidden subtasks when not nested', () => {
    const result = buildDartTaskTree(
      [task('a'), task('b', { parentId: 'a' }), task('c', { parentId: 'gone' })],
      new Map([['a', [task('x', { parentId: 'a' })]]]),
      { nested: false }
    )
    expect(result.rows.map((row) => [row.task.id, row.depth, row.parentId])).toEqual([
      ['a', 0, null],
      ['b', 0, null],
      ['c', 0, null]
    ])
    expect(result.hiddenSubtasks).toBe(0)
  })

  it('nests a child under its loaded parent instead of listing it top level', () => {
    expect(shape([task('b', { parentId: 'a' }), task('a'), task('z')])).toEqual({
      rows: [
        ['a', 0, null],
        ['b', 1, 'a'],
        ['z', 0, null]
      ],
      hiddenSubtasks: 0
    })
  })

  it('leaves out a child whose parent is not loaded and counts it', () => {
    expect(shape([task('a'), task('orphan', { parentId: 'gone' })])).toEqual({
      rows: [['a', 0, null]],
      hiddenSubtasks: 1
    })
  })

  it('shows a child that only the children map knows under its parent', () => {
    const fetched = new Map([['a', [task('kid', { parentId: 'a' })]]])
    expect(shape([task('a')], fetched)).toEqual({
      rows: [
        ['a', 0, null],
        ['kid', 1, 'a']
      ],
      hiddenSubtasks: 0
    })
  })

  it('keeps the newer copy across scope and children map, and for duplicate scope ids', () => {
    const fetched = new Map([
      ['a', [task('kid', { parentId: 'a', title: 'new', updatedAt: '2026-02-01T00:00:00Z' })]]
    ])
    const { rows } = buildDartTaskTree(
      [
        task('a', { title: 'old', updatedAt: '2026-01-01T00:00:00Z' }),
        task('kid', { parentId: 'a', title: 'old', updatedAt: '2026-01-01T00:00:00Z' }),
        task('a', { title: 'newer', updatedAt: '2026-03-01T00:00:00Z' })
      ],
      fetched,
      { nested: true }
    )
    expect(rows.map((row) => [row.task.id, row.task.title])).toEqual([
      ['a', 'newer'],
      ['kid', 'new']
    ])
  })

  it('keeps the first copy on a tie or unparseable timestamps', () => {
    const { rows } = buildDartTaskTree(
      [task('a', { title: 'first', updatedAt: 'nope' }), task('a', { title: 'second' })],
      noChildren,
      { nested: true }
    )
    expect(rows.map((row) => row.task.title)).toEqual(['first'])
  })

  it('draws deeper descendants at depth 1 after the direct children', () => {
    const tasks = [
      task('grand', { parentId: 'child1' }),
      task('child1', { parentId: 'root' }),
      task('root'),
      task('child2', { parentId: 'root' })
    ]
    expect(shape(tasks)).toEqual({
      rows: [
        ['root', 0, null],
        ['child1', 1, 'root'],
        ['child2', 1, 'root'],
        ['grand', 1, 'root']
      ],
      hiddenSubtasks: 0
    })
  })

  it('terminates on parentId cycles and counts unreachable members as hidden', () => {
    const tasks = [
      task('root'),
      task('x', { parentId: 'y' }),
      task('y', { parentId: 'x' }),
      task('self', { parentId: 'self' })
    ]
    expect(shape(tasks)).toEqual({ rows: [['root', 0, null]], hiddenSubtasks: 3 })
  })

  it('terminates when a cycle passes through a reachable descendant', () => {
    const fetched = new Map([['b', [task('a', { parentId: 'b' })]]])
    const tasks = [task('a'), task('b', { parentId: 'a' })]
    expect(shape(tasks, fetched)).toEqual({
      rows: [
        ['a', 0, null],
        ['b', 1, 'a']
      ],
      hiddenSubtasks: 0
    })
  })
})
