import { defineFixture } from '../../../component-fixtures/component-fixture'
import type { Worktree } from '../../../../../shared/worktree/types'
import { fixtureComments, fixtureDetailTask } from './dart-task.mock'
import { DartTaskDetailView } from './TaskDetailView'

const linkedWorkspace = {
  id: 'wt-fix-search',
  displayName: 'fix-search-ranking',
  branch: 'fix-search-ranking',
  path: '/work/fix-search-ranking'
} as Worktree

const noop = (): void => {}

export const loaded = defineFixture({
  width: 780,
  render: () => (
    <div className="h-[720px] bg-background text-foreground">
      <DartTaskDetailView
        task={fixtureDetailTask}
        description={{
          status: 'ready',
          value: fixtureDetailTask.description ?? ''
        }}
        comments={{
          status: 'ready',
          value: {
            comments: fixtureComments,
            totalCount: fixtureComments.length
          }
        }}
        workspaces={[linkedWorkspace]}
        onUse={noop}
        onClose={noop}
        onRetry={noop}
        onOpenWorkspace={noop}
      />
    </div>
  )
})

export const invalidLink = defineFixture({
  width: 780,
  render: () => (
    <div className="h-[660px] bg-background text-foreground">
      <DartTaskDetailView
        task={{ ...fixtureDetailTask, htmlUrl: '' }}
        description={{
          status: 'ready',
          value: fixtureDetailTask.description ?? ''
        }}
        comments={{ status: 'ready', value: { comments: [], totalCount: 0 } }}
        workspaces={[]}
        onUse={noop}
        onClose={noop}
        onRetry={noop}
        onOpenWorkspace={noop}
      />
    </div>
  )
})
