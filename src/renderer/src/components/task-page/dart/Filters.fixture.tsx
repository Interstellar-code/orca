import type { DartSavedView } from '../../../../../shared/dart/dart-saved-views'
import { defineFixture } from '../../../component-fixtures/component-fixture'
import type { DartSavedViewsModel } from './dart-board-contracts'
import { fixtureBoardConfig } from './dart-task.mock'
import { TaskPageDartFiltersView, type DartFiltersBoardControls } from './Filters'
import { DEFAULT_DART_BOARD_FILTERS } from './task-page-dart-list-model'

const triageView: DartSavedView = {
  id: 'view-triage',
  name: 'Triage',
  filters: { ...DEFAULT_DART_BOARD_FILTERS, mine: false, priority: 'high' },
  layout: 'board',
  showEmptyColumns: false
}

function savedViews(overrides: Partial<DartSavedViewsModel> = {}): DartSavedViewsModel {
  return {
    views: [triageView],
    activeViewId: triageView.id,
    modified: false,
    load: { state: 'ready', data: null, error: null, retry: () => {} },
    pending: false,
    supported: true,
    apply: async () => true,
    saveCurrent: async () => true,
    saveAsNew: async () => true,
    rename: async () => true,
    remove: async () => true,
    ...overrides
  }
}

function boardControls(
  overrides: Partial<DartFiltersBoardControls> = {}
): DartFiltersBoardControls {
  return {
    layout: 'board',
    onLayoutChange: () => {},
    listOnly: false,
    switchDisabledReason: null,
    showEmptyColumns: false,
    onShowEmptyColumnsChange: () => {},
    fetchedAt: Date.now() - 5 * 60_000,
    savedViews: savedViews(),
    ...overrides
  }
}

function Shell({
  board,
  onHold = false
}: {
  board: DartFiltersBoardControls
  onHold?: boolean
}): React.JSX.Element {
  return (
    <div className="bg-background p-5 text-foreground">
      <TaskPageDartFiltersView
        filters={{ ...triageView.filters, onHold }}
        config={fixtureBoardConfig}
        viewerAvailable
        hasWorkspace={false}
        loading={false}
        searchInput=""
        onFilterChange={() => {}}
        onHasWorkspaceChange={() => {}}
        onSearchInputChange={() => {}}
        onSearchApply={() => {}}
        onRefresh={() => {}}
        onNewTask={() => {}}
        newTaskDisabled={false}
        board={board}
      />
    </div>
  )
}

export const wide = defineFixture({
  width: 1280,
  render: () => <Shell board={boardControls()} />
})

const savedViewModified = defineFixture({
  width: 1280,
  render: () => (
    <Shell board={boardControls({ savedViews: savedViews({ modified: true }) })} onHold />
  )
})

const listOnly = defineFixture({
  width: 1280,
  render: () => (
    <Shell
      board={boardControls({
        layout: 'list',
        listOnly: true,
        switchDisabledReason: 'oldHost',
        fetchedAt: null,
        savedViews: savedViews({ supported: false })
      })}
    />
  )
})

export { savedViewModified as 'saved-view-modified', listOnly as 'list-only' }
