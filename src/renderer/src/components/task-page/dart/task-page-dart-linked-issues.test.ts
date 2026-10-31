import { describe, expect, it, vi } from 'vitest'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import { filterLinkedDartTasks, readLinkedDartTasks } from './task-page-dart-linked-issues'

function makeTask(id: string, title: string, overrides: Partial<DartTask> = {}): DartTask {
  return {
    id,
    title,
    htmlUrl: `https://app.dartai.com/t/${id}`,
    tags: [],
    ...overrides
  }
}

describe('readLinkedDartTasks', () => {
  it('keeps the tasks that loaded and reports the ones that did not', async () => {
    const found = makeTask('aB3dE5gH7jK9', 'Search results ignore archived projects')
    const fetchTask = vi.fn((taskId: string) =>
      Promise.resolve(
        taskId === found.id
          ? { ok: true as const, task: found }
          : {
              ok: false as const,
              error: 'gone',
              errorCode: 'dart.taskNotFound'
            }
      )
    )

    const result = await readLinkedDartTasks(
      [{ taskId: found.id }, { taskId: 'zZ9yY8xX7wW6' }],
      fetchTask,
      null,
      false
    )

    expect(result.tasks).toEqual([found])
    expect(result.error?.code).toBe('dart.taskNotFound')
  })

  it('reports no error when every linked task loads', async () => {
    const found = makeTask('aB3dE5gH7jK9', 'Add CSV export')
    const result = await readLinkedDartTasks(
      [{ taskId: found.id }],
      () => Promise.resolve({ ok: true as const, task: found }),
      null,
      true
    )
    expect(result.error).toBeNull()
  })
})

describe('filterLinkedDartTasks', () => {
  it('matches title, board and assignee case-insensitively', () => {
    const tasks = [
      makeTask('aB3dE5gH7jK9', 'Add CSV export', {
        dartboard: 'Example/Platform'
      }),
      makeTask('bC4eF6hI8kL0', 'Fix login', { assignee: 'Alex Example' })
    ]
    expect(filterLinkedDartTasks(tasks, 'csv').map((task) => task.id)).toEqual(['aB3dE5gH7jK9'])
    expect(filterLinkedDartTasks(tasks, 'alex').map((task) => task.id)).toEqual(['bC4eF6hI8kL0'])
    expect(filterLinkedDartTasks(tasks, '  ')).toHaveLength(2)
  })
})
