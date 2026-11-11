import { describe, expect, it } from 'vitest'
import {
  DART_COMMENT_MAX_LENGTH,
  DART_REQUEST_TEXT_MAX_BYTES,
  DART_TITLE_MAX_LENGTH
} from '../dart/dart-text-limits'
import {
  AddComment,
  CreateTask,
  DART_TASK_LIST_QUERY_PARAMS,
  ListTasks,
  TaskId,
  UpdateTask,
  UpdateTaskBlockers,
  UpdateTaskDescription
} from './dart-params'

const taskId = 'abcDEF123456'

describe('dart text limits', () => {
  it('accepts a title at the limit and refuses one over in create and update', () => {
    const atLimit = 'x'.repeat(DART_TITLE_MAX_LENGTH)
    const over = `${atLimit}x`
    expect(CreateTask.safeParse({ title: atLimit }).success).toBe(true)
    expect(CreateTask.safeParse({ title: over }).success).toBe(false)
    expect(UpdateTask.safeParse({ taskId, updates: { title: atLimit } }).success).toBe(true)
    expect(UpdateTask.safeParse({ taskId, updates: { title: over } }).success).toBe(false)
  })

  it('accepts a comment at the limit and refuses one over', () => {
    const atLimit = 'x'.repeat(DART_COMMENT_MAX_LENGTH)
    expect(AddComment.safeParse({ taskId, text: atLimit }).success).toBe(true)
    expect(AddComment.safeParse({ taskId, text: `${atLimit}x` }).success).toBe(false)
  })

  it('caps a description by UTF-8 bytes, including multi-byte text under the character cap', () => {
    const atLimit = 'x'.repeat(DART_REQUEST_TEXT_MAX_BYTES)
    const multiByteOver = 'é'.repeat(DART_REQUEST_TEXT_MAX_BYTES / 2 + 1)
    expect(multiByteOver.length).toBeLessThan(DART_REQUEST_TEXT_MAX_BYTES)
    expect(CreateTask.safeParse({ title: 't', description: atLimit }).success).toBe(true)
    expect(CreateTask.safeParse({ title: 't', description: `${atLimit}x` }).success).toBe(false)
    expect(CreateTask.safeParse({ title: 't', description: multiByteOver }).success).toBe(false)
    expect(UpdateTask.safeParse({ taskId, updates: { description: multiByteOver } }).success).toBe(
      false
    )
  })

  it('caps a description patch as the sum of every text', () => {
    const half = 'x'.repeat(DART_REQUEST_TEXT_MAX_BYTES / 2)
    const patch = (extra: string) => ({
      taskId,
      updates: [{ type: 'replace', oldText: half, newText: `${half}${extra}` }]
    })
    expect(UpdateTaskDescription.safeParse(patch('')).success).toBe(true)
    expect(UpdateTaskDescription.safeParse(patch('x')).success).toBe(false)
  })

  it('counts anchorText and newText of an insert toward the cap', () => {
    const half = 'x'.repeat(DART_REQUEST_TEXT_MAX_BYTES / 2)
    const insert = (anchorText: string) => ({
      taskId,
      updates: [{ type: 'insert_after', anchorText, newText: half }]
    })
    expect(UpdateTaskDescription.safeParse(insert(half)).success).toBe(true)
    expect(UpdateTaskDescription.safeParse(insert(`${half}x`)).success).toBe(false)
  })

  it('caps a multi-byte patch by bytes although its characters are under the cap', () => {
    const oldText = 'é'.repeat(DART_REQUEST_TEXT_MAX_BYTES / 2 + 1)
    expect(oldText.length).toBeLessThan(DART_REQUEST_TEXT_MAX_BYTES)
    const result = UpdateTaskDescription.safeParse({
      taskId,
      updates: [{ type: 'delete', oldText }]
    })
    expect(result.success).toBe(false)
  })

  it('sums the texts across two updates', () => {
    const half = 'x'.repeat(DART_REQUEST_TEXT_MAX_BYTES / 2)
    const two = (second: string) => ({
      taskId,
      updates: [
        { type: 'delete', oldText: half },
        { type: 'delete', oldText: second }
      ]
    })
    expect(UpdateTaskDescription.safeParse(two(half)).success).toBe(true)
    expect(UpdateTaskDescription.safeParse(two(`${half}x`)).success).toBe(false)
  })
})

describe('dart write params', () => {
  it('refuses a patch update that carries occurrence', () => {
    const result = UpdateTaskDescription.safeParse({
      taskId,
      updates: [{ type: 'replace', oldText: 'a', newText: 'b', occurrence: 2 }]
    })
    expect(result.success).toBe(false)
  })

  it.each([
    [{ type: 'replace', oldText: 'a' }],
    [{ type: 'delete' }],
    [{ type: 'insert_before', newText: 'b' }],
    [{ type: 'insert_after', anchorText: 'a' }]
  ])('refuses a patch update missing a required field: %j', (update) => {
    expect(UpdateTaskDescription.safeParse({ taskId, updates: [update] }).success).toBe(false)
  })

  it.each([
    [{ type: 'delete', oldText: 'a', newText: 'b' }],
    [{ type: 'delete', oldText: 'a', anchorText: 'b' }],
    [{ type: 'replace', oldText: 'a', newText: 'b', anchorText: 'c' }],
    [{ type: 'insert_before', anchorText: 'a', newText: 'b', oldText: 'c' }]
  ])('refuses a patch update with a field its type does not take: %j', (update) => {
    expect(UpdateTaskDescription.safeParse({ taskId, updates: [update] }).success).toBe(false)
  })

  it('refuses an empty updates list', () => {
    expect(UpdateTaskDescription.safeParse({ taskId, updates: [] }).success).toBe(false)
  })

  it('accepts a size-only update, including null, and date-only dates', () => {
    expect(UpdateTask.safeParse({ taskId, updates: { size: null } }).success).toBe(true)
    expect(UpdateTask.safeParse({ taskId, updates: { size: 'M' } }).success).toBe(true)
    expect(UpdateTask.safeParse({ taskId, updates: { dueAt: '2026-11-30' } }).success).toBe(true)
    expect(
      UpdateTask.safeParse({ taskId, updates: { dueAt: '2026-11-30T10:00:00+01:00' } }).success
    ).toBe(true)
    expect(UpdateTask.safeParse({ taskId, updates: { dueAt: '30/11/2026' } }).success).toBe(false)
    expect(UpdateTask.safeParse({ taskId, updates: {} }).success).toBe(false)
  })
})

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

  it('accepts parentId and ids filters and maps parentId to parent_id', () => {
    expect(DART_TASK_LIST_QUERY_PARAMS.parentId).toBe('parent_id')
    expect(DART_TASK_LIST_QUERY_PARAMS.ids).toBe('ids')
    expect(ListTasks.safeParse({ parentId: taskId, ids: [taskId] }).success).toBe(true)
    expect(ListTasks.safeParse({ parentId: '' }).success).toBe(false)
  })

  it('bounds ids to 1 to 100 entries', () => {
    const idsOf = (count: number): string[] =>
      Array.from({ length: count }, (_, i) => `abcDEF${String(i).padStart(6, '0')}`)
    expect(ListTasks.safeParse({ ids: idsOf(100) }).success).toBe(true)
    expect(ListTasks.safeParse({ ids: idsOf(101) }).success).toBe(false)
    expect(ListTasks.safeParse({ ids: [] }).success).toBe(false)
  })
})

describe('UpdateTaskBlockers', () => {
  const other = 'zyxWVU987654'

  it('accepts a replacement list, including an empty one', () => {
    expect(UpdateTaskBlockers.safeParse({ taskId, blockerIds: [other] }).success).toBe(true)
    expect(UpdateTaskBlockers.safeParse({ taskId, blockerIds: [] }).success).toBe(true)
  })

  it('refuses bad ids, duplicates, over 100 ids and a self-block', () => {
    const many = Array.from({ length: 101 }, (_, i) => `abcDEF${String(i).padStart(6, '0')}`)
    expect(UpdateTaskBlockers.safeParse({ taskId, blockerIds: ['short'] }).success).toBe(false)
    expect(UpdateTaskBlockers.safeParse({ taskId, blockerIds: [other, other] }).success).toBe(false)
    expect(UpdateTaskBlockers.safeParse({ taskId, blockerIds: many }).success).toBe(false)
    expect(UpdateTaskBlockers.safeParse({ taskId, blockerIds: [taskId] }).success).toBe(false)
  })
})
