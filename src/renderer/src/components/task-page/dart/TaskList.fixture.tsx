import type { Worktree } from '../../../../../shared/worktree/types'
import { defineFixture } from '../../../component-fixtures/component-fixture'
import { TaskPageDartFiltersView } from './Filters'
import { fixtureConfig, fixtureHierarchyTasks, fixtureTasks } from './dart-task.mock'
import { TaskPageDartTaskList } from './TaskList'
import { useStubNestedListModel } from './TaskList.nested.test-support'
import { DEFAULT_DART_LIST_FILTERS } from './task-page-dart-list-model'

const linkedWorkspace = {
  id: 'wt-fix-search',
  displayName: 'fix-search-ranking',
  branch: 'fix-search-ranking',
  path: '/work/fix-search-ranking'
} as Worktree

const nestedScope = [
  { ...fixtureHierarchyTasks[0], tags: ['billing'] },
  ...fixtureHierarchyTasks.slice(1),
  ...fixtureTasks.slice(0, 2)
]

function ListShell({
  truncated,
  nested = false
}: {
  truncated: boolean
  nested?: boolean
}): React.JSX.Element {
  const model = useStubNestedListModel({
    tasks: nestedScope,
    initiallyExpanded: [fixtureHierarchyTasks[0].id]
  })
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
        onNewTask={() => {}}
        newTaskDisabled={false}
      />
      <div className="@container overflow-hidden rounded-md rounded-t-none border border-t-0 border-border/50 bg-background shadow-sm">
        {truncated ? (
          <div className="border-b border-border/50 bg-muted/35 px-4 py-2 text-xs text-muted-foreground">
            Showing first 4 of 250 tasks. Narrow the filters to see the rest.
          </div>
        ) : null}
        <TaskPageDartTaskList
          tasks={nested ? nestedScope : fixtureTasks}
          nested={nested ? model : undefined}
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
export const nested = defineFixture({
  width: 1100,
  render: () => <ListShell truncated={false} nested />
})
