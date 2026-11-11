// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { DartLoad, DartRelationshipsApi, DartTaskPage } from './dart-board-contracts'
import { TaskDetailSubtasks } from './TaskDetailSubtasks'

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

const open = task('subOpen00001', 'Add the export button')
const done = task('subDone00001', 'Document the columns', {
  status: 'Done',
  completedAt: '2026-11-01T00:00:00Z'
})

function load<T>(state: DartLoad<T>['state'], data: T | null, error: string | null = null) {
  return { state, data, error, retry: vi.fn() }
}

function api(subtasks: DartLoad<DartTaskPage>, state: DartRelationshipsApi['state'] = 'known') {
  const relationships: DartRelationshipsApi = {
    task: task('parentTask001', 'Parent task'),
    state,
    parent: null,
    blockers: load<readonly DartTask[]>('ready', null),
    blocking: load<readonly DartTask[]>('ready', null),
    subtasks,
    pending: false,
    blocked: false,
    notice: { notice: null, dismissNotice: vi.fn(), recheckNotice: vi.fn() },
    onSetBlockers: vi.fn(),
    searchTasks: vi.fn()
  }
  return relationships
}

function renderIt(relationships: DartRelationshipsApi, onOpen = vi.fn()) {
  render(<TaskDetailSubtasks relationships={relationships} onOpenRelatedTask={onOpen} />)
  return onOpen
}

describe('TaskDetailSubtasks', () => {
  it('shows N of M done and opens a clicked subtask', () => {
    const onOpen = renderIt(api(load('ready', { tasks: [open, done], total: 2, complete: true })))
    expect(screen.getByText('1 of 2 done')).toBeTruthy()
    expect(screen.getByText('Adding subtasks from Orca comes later.')).toBeTruthy()
    expect(screen.queryByText(/Showing/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Add the export button/ }))
    expect(onOpen).toHaveBeenCalledWith(open)
  })

  it('says what was loaded when the page is truncated', () => {
    renderIt(api(load('ready', { tasks: [open, done], total: 340, complete: false })))
    expect(screen.getByText('Showing 2 of 340')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open in Dart' })).toBeTruthy()
    expect(screen.queryByText(/of 340 done/)).toBeNull()
  })

  it('shows empty, error with retry, and nothing when links were not returned', () => {
    const { unmount } = render(
      <TaskDetailSubtasks
        relationships={api(load('ready', { tasks: [], total: 0, complete: true }))}
        onOpenRelatedTask={vi.fn()}
      />
    )
    expect(screen.getByText('No subtasks')).toBeTruthy()
    unmount()

    const failed = load('error', null, 'Read failed')
    const { unmount: unmountError } = render(
      <TaskDetailSubtasks relationships={api(failed)} onOpenRelatedTask={vi.fn()} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(failed.retry).toHaveBeenCalledTimes(1)
    unmountError()

    const { container } = render(
      <TaskDetailSubtasks
        relationships={api(
          load('ready', { tasks: [open], total: 1, complete: true }),
          'notChecked'
        )}
        onOpenRelatedTask={vi.fn()}
      />
    )
    expect(container.textContent).toBe('')
  })
})
