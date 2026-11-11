import { defineFixture } from '../../../component-fixtures/component-fixture'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { DartLoad, DartRelationshipsApi } from './dart-board-contracts'
import { fixtureBlockedOnHold, fixtureSubtaskParent, fixtureTasks } from './dart-task.mock'
import { TaskDetailRelationships } from './TaskDetailRelationships'

const ready = <T,>(data: T): DartLoad<T> => ({ state: 'ready', data, error: null, retry: () => {} })

const finishedBlocker: DartTask = {
  ...fixtureTasks[3],
  completedAt: new Date(Date.now() - 86_400_000).toISOString()
}

function api(task: DartTask, overrides: Partial<DartRelationshipsApi>): DartRelationshipsApi {
  return {
    task,
    state: 'known',
    parent: null,
    blockers: ready([]),
    blocking: ready([]),
    subtasks: ready({ tasks: [], total: 0, complete: true }),
    pending: false,
    blocked: false,
    notice: { notice: null, dismissNotice: () => {}, recheckNotice: () => Promise.resolve() },
    onSetBlockers: () => Promise.reject(new Error('Fixture does not write.')),
    searchTasks: () => Promise.resolve({ ok: true, tasks: [] }),
    ...overrides
  }
}

function frame(relationships: DartRelationshipsApi): React.JSX.Element {
  return (
    <div className="bg-background text-foreground">
      <TaskDetailRelationships relationships={relationships} onOpenRelatedTask={() => {}} />
    </div>
  )
}

export const defaultView = defineFixture({
  width: 780,
  render: () =>
    frame(
      api(fixtureTasks[1], {
        parent: ready(fixtureSubtaskParent),
        blockers: ready([fixtureTasks[0], finishedBlocker]),
        blocking: ready([fixtureTasks[2]])
      })
    )
})

const onHoldView = defineFixture({
  width: 780,
  render: () =>
    frame(
      api(fixtureBlockedOnHold, {
        blockers: ready([fixtureTasks[0], fixtureTasks[1], finishedBlocker])
      })
    )
})

export { defaultView as default, onHoldView as 'on-hold' }
