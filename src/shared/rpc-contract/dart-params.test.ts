import { describe, expect, it } from 'vitest'
import { DART_TASK_LIST_QUERY_PARAMS, ListTasks, TaskId, UpdateTask } from './dart-params'

describe('Dart RPC params', () => {
  it('rejects list filters Dart would silently ignore', () => {
    expect(ListTasks.safeParse({ q: 'search' }).success).toBe(false)
    expect(ListTasks.safeParse({ title: 'ship', limit: 251 }).success).toBe(false)
  })

  it('maps every list filter to a whitelisted Dart query parameter', () => {
    const shape = ListTasks.unwrap().shape
    const filters = Object.keys(shape).filter((key) => key !== 'limit' && key !== 'offset')
    expect(filters.sort()).toEqual(Object.keys(DART_TASK_LIST_QUERY_PARAMS).sort())
  })

  it('requires a 12-character task id and at least one update', () => {
    expect(TaskId.safeParse({ taskId: 'aBcD3fGh1jKl' }).success).toBe(true)
    expect(TaskId.safeParse({ taskId: 'aBcD3fGh1jK' }).success).toBe(false)
    expect(UpdateTask.safeParse({ taskId: 'aBcD3fGh1jKl', updates: {} }).success).toBe(false)
    expect(
      UpdateTask.safeParse({ taskId: 'aBcD3fGh1jKl', updates: { assignee: null } }).success
    ).toBe(true)
  })
})
