// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import { dartTaskFixture } from '@/store/slices/dart/dart-fake-runtime.test-support'
import { enqueueDartTaskWrite } from './dart-task-write-queue'
import { mergeDartPinnedRows, useDartListPinnedRows } from './use-dart-list-pinned-rows'

let nextScope = 0
function freshAccount() {
  nextScope += 1
  return { hostKey: `pinned-host-${nextScope}`, accountKey: 'user-a' }
}

/** A write that never settles keeps its optimistic patch visible and published, like an in-flight edit. */
function editInFlight(
  account: { hostKey: string; accountKey: string },
  previous: DartTask,
  optimistic: Pick<DartTask, 'status'>
): void {
  void enqueueDartTaskWrite({
    identity: { ...account, taskId: previous.id },
    previous,
    optimistic,
    write: () => new Promise(() => {}),
    refresh: () => new Promise(() => {}),
    patch: () => {},
    invalidateLists: () => {}
  })
}

function renderPins(
  account: { hostKey: string; accountKey: string },
  tasks: readonly DartTask[],
  onRowPatch?: (taskId: string, fields: Partial<DartTask>) => void
) {
  return renderHook(
    (props: { hostKey: string; tasks: readonly DartTask[] }) =>
      useDartListPinnedRows({
        active: true,
        hostKey: props.hostKey,
        accountKey: account.accountKey,
        tasks: props.tasks,
        onRowPatch
      }),
    { initialProps: { hostKey: account.hostKey, tasks } }
  )
}

describe('mergeDartPinnedRows', () => {
  it('puts a pinned row the read no longer returns on top and leaves the read untouched', () => {
    const account = freshAccount()
    const read = Object.freeze([dartTaskFixture('a'), dartTaskFixture('b')])
    const gone = dartTaskFixture('gone', { status: 'Doing' })
    const pinned = new Map([[gone.id, { row: gone, survivesNextClear: false }]])

    const merged = mergeDartPinnedRows(read, pinned, account)

    expect(merged.map((row) => row.id)).toEqual(['gone', 'a', 'b'])
    expect(read.map((row) => row.id)).toEqual(['a', 'b'])
  })

  it('returns the same array when every pinned row is already in the read', () => {
    const account = freshAccount()
    const read = [dartTaskFixture('a')]
    const pinned = new Map([['a', { row: dartTaskFixture('a'), survivesNextClear: false }]])
    expect(mergeDartPinnedRows(read, pinned, account)).toBe(read)
  })
})

describe('useDartListPinnedRows', () => {
  it('keeps an edited row listed after a re-read drops it, until a new list key', () => {
    const account = freshAccount()
    const row = dartTaskFixture('edited')
    const { result, rerender } = renderPins(account, [row])
    act(() => result.current.clearPinsOnNewList('first'))

    act(() => editInFlight(account, row, { status: 'Done' }))
    rerender({ hostKey: account.hostKey, tasks: [] })

    const merged = mergeDartPinnedRows([], result.current.pinnedRows, account)
    expect(merged).toEqual([expect.objectContaining({ id: 'edited', status: 'Done' })])

    act(() => result.current.clearPinsOnNewList('second'))
    expect(result.current.pinnedRows.size).toBe(0)
  })

  it('shows a created task on top and keeps it through exactly one new list key', () => {
    const account = freshAccount()
    const read = Object.freeze([dartTaskFixture('a')])
    const { result } = renderPins(account, read)
    act(() => result.current.clearPinsOnNewList('first'))

    act(() =>
      result.current.noteDartTaskCreated(dartTaskFixture('made', { description: 'secret body' }))
    )
    const merged = mergeDartPinnedRows(read, result.current.pinnedRows, account)
    expect(merged.map((row) => row.id)).toEqual(['made', 'a'])
    expect(merged[0]).not.toHaveProperty('description')

    act(() => result.current.clearPinsOnNewList('second'))
    expect([...result.current.pinnedRows.keys()]).toEqual(['made'])
    act(() => result.current.clearPinsOnNewList('third'))
    expect(result.current.pinnedRows.size).toBe(0)
  })

  it('still pins an edit made to a created row', () => {
    const account = freshAccount()
    const made = dartTaskFixture('made')
    const { result } = renderPins(account, [])
    act(() => result.current.noteDartTaskCreated(made))

    act(() => editInFlight(account, made, { status: 'Doing' }))

    expect(result.current.pinnedRows.get('made')?.row.status).toBe('Doing')
    expect(result.current.pinnedRows.get('made')?.survivesNextClear).toBe(true)
  })

  it('does not show a pinned row of host A on host B', () => {
    const account = freshAccount()
    const { result, rerender } = renderPins(account, [])
    act(() => result.current.noteDartTaskCreated(dartTaskFixture('made')))
    expect(result.current.pinnedRows.size).toBe(1)

    rerender({ hostKey: `${account.hostKey}-b`, tasks: [] })
    expect(result.current.pinnedRows.size).toBe(0)

    rerender({ hostKey: account.hostKey, tasks: [] })
    expect(result.current.pinnedRows.size).toBe(0)
  })

  it('gives onRowPatch the row fields without a description', () => {
    const account = freshAccount()
    const row = dartTaskFixture('edited')
    const onRowPatch = vi.fn()
    renderPins(account, [row], onRowPatch)

    act(() => editInFlight(account, row, { status: 'Done' }))

    expect(onRowPatch).toHaveBeenCalledWith('edited', { status: 'Done' })
  })
})
