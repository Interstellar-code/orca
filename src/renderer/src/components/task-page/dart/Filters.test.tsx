// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DartWorkspaceConfig } from '../../../../../shared/dart/dart-types'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TaskPageDartFiltersView, type TaskPageDartFiltersProps } from './Filters'

const config: DartWorkspaceConfig = {
  dartboards: ['Example/Platform'],
  statuses: ['To-do'],
  types: [],
  tags: [],
  priorities: [],
  sizes: [],
  assignees: []
}

afterEach(cleanup)

/** The real filters row, so the New task button is the one the page renders. */
function renderFilters(overrides: Partial<TaskPageDartFiltersProps> = {}): void {
  const props: TaskPageDartFiltersProps = {
    filters: { mine: false, status: null, dartboard: null, search: '' },
    config,
    viewerAvailable: true,
    hasWorkspace: false,
    loading: false,
    searchInput: '',
    onFilterChange: () => {},
    onHasWorkspaceChange: () => {},
    onSearchInputChange: () => {},
    onSearchApply: () => {},
    onRefresh: () => {},
    onNewTask: () => {},
    newTaskDisabled: false,
    ...overrides
  }
  render(
    <TooltipProvider>
      <TaskPageDartFiltersView {...props} />
    </TooltipProvider>
  )
}

describe('Dart filters new task button', () => {
  it('calls onNewTask so the dialog opens from the same model state', async () => {
    const user = userEvent.setup()
    const onNewTask = vi.fn()
    renderFilters({ onNewTask })

    await user.click(screen.getByRole('button', { name: 'New task' }))

    expect(onNewTask).toHaveBeenCalledTimes(1)
  })

  it('is disabled while Dart is not connected', () => {
    renderFilters({ newTaskDisabled: true })

    expect(screen.getByRole('button', { name: 'New task' })).toHaveProperty('disabled', true)
  })
})
