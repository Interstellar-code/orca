import type { Worktree } from '../../../../../shared/worktree/types'
import { defineFixture } from '../../../component-fixtures/component-fixture'
import { TaskPageDartFiltersView } from './Filters'
import { fixtureConfig, fixtureTasks } from './dart-task.mock'
import { TaskPageDartTaskList } from './TaskList'
import { DEFAULT_DART_LIST_FILTERS } from './task-page-dart-list-model'

const linkedWorkspace = {
  id: 'wt-fix-search',
  displayName: 'fix-search-ranking',
  branch: 'fix-search-ranking',
  path: '/work/fix-search-ranking'
} as Worktree

function ListShell({ truncated }: { truncated: boolean }): React.JSX.Element {
  return (
    <div className="bg-background p-5 text-foreground">
      <TaskPageDartFiltersView
        filters={DEFAULT_DART_LIST_FILTERS}
        config={fixtureConfig}
        viewerAvailable
        hasWorkspace={false}
        loading={false}
        searchInput=""
        onFilterChange={() => {}}
        onHasWorkspaceChange={() => {}}
        onSearchInputChange={() => {}}
        onSearchApply={() => {}}
        onRefresh={() => {}}
      />
      <div className="@container overflow-hidden rounded-md rounded-t-none border border-t-0 border-border/50 bg-background shadow-sm">
        {truncated ? (
          <div className="border-b border-border/50 bg-muted/35 px-4 py-2 text-xs text-muted-foreground">
            Showing first 4 of 250 tasks. Narrow the filters to see the rest.
          </div>
        ) : null}
        <TaskPageDartTaskList
          tasks={fixtureTasks}
          selectedTaskId={null}
          getTaskWorkspaces={(task) => (task.id === 'aB3dE5gH7jK9' ? [linkedWorkspace] : [])}
          onOpenTask={() => {}}
          onStartWorkspace={() => {}}
          onOpenWorkspace={() => {}}
        />
      </div>
    </div>
  )
}

export const wide = defineFixture({
  width: 1100,
  render: () => <ListShell truncated={false} />
})
export const truncated = defineFixture({
  width: 1100,
  render: () => <ListShell truncated />
})
export const narrow = defineFixture({
  width: 560,
  render: () => <ListShell truncated={false} />
})
