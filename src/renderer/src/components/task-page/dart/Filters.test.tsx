// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'

import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DartWorkspaceConfig } from '../../../../../shared/dart/dart-types'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { DartSavedViewsModel } from './dart-board-contracts'
import {
  TaskPageDartFiltersView,
  type DartFiltersBoardControls,
  type TaskPageDartFiltersProps
} from './Filters'

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

const boardConfig: DartWorkspaceConfig = {
  ...config,
  statuses: ['To-do', 'On hold'],
  tags: ['backend'],
  priorities: ['high']
}

const savedViews: DartSavedViewsModel = {
  views: [],
  activeViewId: null,
  modified: false,
  load: { state: 'ready', data: null, error: null, retry: () => {} },
  pending: false,
  supported: true,
  apply: async () => true,
  saveCurrent: async () => true,
  saveAsNew: async () => true,
  rename: async () => true,
  remove: async () => true
}

function boardControls(
  overrides: Partial<DartFiltersBoardControls> = {}
): DartFiltersBoardControls {
  return {
    layout: 'list',
    onLayoutChange: () => {},
    listOnly: false,
    switchDisabledReason: null,
    showEmptyColumns: false,
    onShowEmptyColumnsChange: () => {},
    fetchedAt: null,
    savedViews,
    ...overrides
  }
}

describe('Dart filters board controls', () => {
  it('switches layout and keeps the filter row', async () => {
    const user = userEvent.setup()
    const onLayoutChange = vi.fn()
    renderFilters({ config: boardConfig, board: boardControls({ onLayoutChange }) })

    await user.click(screen.getByRole('radio', { name: 'Board' }))

    expect(onLayoutChange).toHaveBeenCalledWith('board')
    expect(screen.getByRole('combobox', { name: 'Tag' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Priority' })).toBeTruthy()
  })

  it.each([
    ['linked', 'Turn off linked tasks to use the board'],
    ['oldHost', 'Update the remote Orca server to use the board']
  ] as const)('disables the switch with its tooltip when %s', async (reason, tooltip) => {
    const user = userEvent.setup()
    const onLayoutChange = vi.fn()
    renderFilters({
      config: boardConfig,
      board: boardControls({ switchDisabledReason: reason, listOnly: true, onLayoutChange })
    })

    // The tooltip trigger is the wrapper span: a disabled group never receives pointer events.
    act(() => screen.getByRole('radiogroup', { name: 'Dart layout' }).parentElement?.focus())
    expect((await screen.findAllByText(tooltip)).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('radio', { name: 'Board' }))

    expect(onLayoutChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('combobox', { name: 'Tag' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'On hold' })).toBeNull()
  })

  it('offers the On hold chip only when /config has the status or the tag', async () => {
    const user = userEvent.setup()
    const onFilterChange = vi.fn()
    cleanup()
    renderFilters({ board: boardControls() })
    expect(screen.queryByRole('button', { name: 'On hold' })).toBeNull()
    cleanup()
    renderFilters({ config: boardConfig, onFilterChange, board: boardControls() })

    await user.click(screen.getByRole('button', { name: 'On hold' }))

    expect(onFilterChange).toHaveBeenCalledWith('onHold', true)
  })

  it('shows "Show empty columns" only in the board layout and the data age beside refresh', () => {
    renderFilters({
      config: boardConfig,
      board: boardControls({ layout: 'board', fetchedAt: Date.now() - 5 * 60_000 })
    })

    expect(screen.getByRole('switch', { name: 'Show empty columns' })).toBeTruthy()
    expect(screen.getByText(/^Updated .*ago$/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Has Workspace' })).toBeNull()
    cleanup()
    renderFilters({ config: boardConfig, board: boardControls({ layout: 'list' }) })
    expect(screen.queryByRole('switch', { name: 'Show empty columns' })).toBeNull()
  })
})
