// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { DartLoad, DartRelationshipsApi } from './dart-board-contracts'
import { dartRelationshipsKnown, TaskDetailRelationships } from './TaskDetailRelationships'

vi.mock('./DartBlockerPicker', () => ({
  DartBlockerPicker: ({
    taskId,
    excludeIds,
    disabled,
    onPick
  }: {
    taskId: string
    excludeIds: readonly string[]
    disabled?: boolean
    onPick: (task: DartTask) => void
  }) => (
    <button
      type="button"
      disabled={disabled}
      data-exclude={excludeIds.join(',')}
      data-task-id={taskId}
      onClick={() => onPick(task('newBlocker001', 'Picked task'))}
    >
      + Add blocker
    </button>
  )
}))

afterEach(cleanup)

function task(id: string, title: string, extra: Partial<DartTask> = {}): DartTask {
  return {
    id,
    title,
    htmlUrl: `https://app.dartai.com/t/${id}`,
    tags: [],
    status: 'To-do',
    ...extra
  }
}

function ready<T>(data: T): DartLoad<T> {
  return { state: 'ready', data, error: null, retry: vi.fn() }
}

function api(overrides: Partial<DartRelationshipsApi> = {}): DartRelationshipsApi {
  return {
    task: task('openTask0001', 'Open task'),
    state: 'known',
    parent: null,
    blockers: ready([]),
    blocking: ready([]),
    subtasks: ready({ tasks: [], total: 0, complete: true }),
    pending: false,
    blocked: false,
    notice: { notice: null, dismissNotice: vi.fn(), recheckNotice: vi.fn() },
    onSetBlockers: vi.fn(() =>
      Promise.resolve({ ok: true as const, task: task('openTask0001', 'Open task') })
    ),
    searchTasks: vi.fn(() => Promise.resolve({ ok: true as const, tasks: [] })),
    ...overrides
  }
}

const blockerA = task('blockerA0001', 'Fix the schema')
const blockerB = task('blockerB0001', 'Ship the migration', {
  status: 'Done',
  completedAt: '2026-11-01T00:00:00Z'
})

function renderIt(relationships: DartRelationshipsApi, onOpen = vi.fn()) {
  render(<TaskDetailRelationships relationships={relationships} onOpenRelatedTask={onOpen} />)
  return onOpen
}

describe('TaskDetailRelationships blockers', () => {
  it('removing a blocker writes the full remaining list once', () => {
    const relationships = api({ blockers: ready([blockerA, blockerB]) })
    renderIt(relationships)
    fireEvent.click(screen.getByRole('button', { name: 'Remove blocker Fix the schema' }))
    expect(relationships.onSetBlockers).toHaveBeenCalledTimes(1)
    expect(relationships.onSetBlockers).toHaveBeenCalledWith(['blockerB0001'])
  })

  it('adding a blocker writes the full list with the pick once', () => {
    const relationships = api({ blockers: ready([blockerA]) })
    renderIt(relationships)
    const add = screen.getByRole('button', { name: '+ Add blocker' })
    expect(add.getAttribute('data-exclude')).toBe('blockerA0001')
    expect(add.getAttribute('data-task-id')).toBe('openTask0001')
    fireEvent.click(add)
    expect(relationships.onSetBlockers).toHaveBeenCalledTimes(1)
    expect(relationships.onSetBlockers).toHaveBeenCalledWith(['blockerA0001', 'newBlocker001'])
  })

  it('disables add and remove while the field is blocked', () => {
    renderIt(api({ blockers: ready([blockerA]), blocked: true }))
    expect(
      screen.getByRole('button', { name: 'Remove blocker Fix the schema' }).hasAttribute('disabled')
    ).toBe(true)
    expect(screen.getByRole('button', { name: '+ Add blocker' }).hasAttribute('disabled')).toBe(
      true
    )
  })

  it('shows a refusal and an unknown outcome from the relationships notice', () => {
    const notice = (kind: 'refused' | 'unknown', message: string) => ({
      notice: { kind, field: 'relationships', message },
      dismissNotice: vi.fn(),
      recheckNotice: vi.fn()
    })
    const { rerender } = render(
      <TaskDetailRelationships
        relationships={api({ notice: notice('refused', 'Dart refused the blocker') })}
        onOpenRelatedTask={vi.fn()}
      />
    )
    expect(screen.getByRole('alert').textContent).toContain('Dart refused the blocker')
    rerender(
      <TaskDetailRelationships
        relationships={api({ notice: notice('unknown', 'The change may not have saved') })}
        onOpenRelatedTask={vi.fn()}
      />
    )
    expect(screen.getByRole('status').textContent).toContain('The change may not have saved')
    expect(screen.getByRole('button', { name: 'Check again' })).toBeTruthy()
  })

  it('ignores a notice for another field', () => {
    renderIt(
      api({
        notice: {
          notice: { kind: 'refused', field: 'status', message: 'Status refused' },
          dismissNotice: vi.fn(),
          recheckNotice: vi.fn()
        }
      })
    )
    expect(screen.queryByText(/Status refused/)).toBeNull()
  })

  it('shows a titles error with retry and no write controls', () => {
    const blockers: DartLoad<readonly DartTask[]> = {
      state: 'error',
      data: null,
      error: null,
      retry: vi.fn()
    }
    renderIt(api({ blockers }))
    expect(screen.getByText('Could not load titles')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '+ Add blocker' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(blockers.retry).toHaveBeenCalledTimes(1)
  })
})

describe('TaskDetailRelationships on-hold banner', () => {
  const onHold = task('openTask0001', 'Open task', { status: 'On hold' })

  it('counts only open blockers, plural', () => {
    renderIt(
      api({ task: onHold, blockers: ready([blockerA, task('blockerC0001', 'Another'), blockerB]) })
    )
    expect(screen.getByText('On hold · waiting on 2 open blockers')).toBeTruthy()
  })

  it('uses the singular for one open blocker', () => {
    renderIt(api({ task: onHold, blockers: ready([blockerA, blockerB]) }))
    expect(screen.getByText('On hold · waiting on 1 open blocker')).toBeTruthy()
  })

  it('is absent when the task is not on hold or every blocker is done', () => {
    const { unmount } = render(
      <TaskDetailRelationships
        relationships={api({ blockers: ready([blockerA]) })}
        onOpenRelatedTask={vi.fn()}
      />
    )
    expect(screen.queryByText(/waiting on/)).toBeNull()
    unmount()
    renderIt(api({ task: onHold, blockers: ready([blockerB]) }))
    expect(screen.queryByText(/waiting on/)).toBeNull()
  })
})

describe('TaskDetailRelationships parent and blocking', () => {
  it('opens the parent', () => {
    const parent = task('parentTask001', 'Rework the report')
    const onOpen = renderIt(api({ parent: ready(parent) }))
    fireEvent.click(screen.getByRole('button', { name: /Rework the report/ }))
    expect(onOpen).toHaveBeenCalledWith(parent)
  })

  it('hides the parent group without a parent', () => {
    renderIt(api())
    expect(screen.queryByText('Parent')).toBeNull()
  })

  it('lists blocking tasks read-only with the hint and opens one', () => {
    const blocked = task('blocked00001', 'Publish the report')
    const onOpen = renderIt(api({ blocking: ready([blocked]) }))
    expect(screen.getByText(/change it on that task/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Remove blocker Publish/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Publish the report/ }))
    expect(onOpen).toHaveBeenCalledWith(blocked)
  })
})

describe('TaskDetailRelationships links not returned', () => {
  it('shows one notice and no group content', () => {
    const relationships = api({ state: 'notChecked', blockers: ready([blockerA]) })
    renderIt(relationships)
    expect(screen.getByText("Dart did not return this task's links")).toBeTruthy()
    expect(screen.queryByText('Blocked by')).toBeNull()
    expect(screen.queryByText('Fix the schema')).toBeNull()
    expect(dartRelationshipsKnown(relationships)).toBe(false)
    expect(dartRelationshipsKnown(api())).toBe(true)
  })
})
