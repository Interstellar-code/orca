import { defineFixture } from '../../../component-fixtures/component-fixture'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { DartLoad, DartRelationshipsApi, DartTaskPage } from './dart-board-contracts'
import { fixtureSubtaskParent, fixtureSubtasks } from './dart-task.mock'
import { TaskDetailSubtasks } from './TaskDetailSubtasks'

const ready = <T,>(data: T): DartLoad<T> => ({ state: 'ready', data, error: null, retry: () => {} })

function frame(page: DartTaskPage): React.JSX.Element {
  const relationships: DartRelationshipsApi = {
    task: fixtureSubtaskParent,
    state: 'known',
    parent: null,
    blockers: ready([]),
    blocking: ready([]),
    subtasks: ready(page),
    pending: false,
    blocked: false,
    notice: { notice: null, dismissNotice: () => {}, recheckNotice: () => Promise.resolve() },
    onSetBlockers: () => Promise.reject(new Error('Fixture does not write.')),
    searchTasks: () => Promise.resolve({ ok: true, tasks: [] })
  }
  return (
    <div className="bg-background text-foreground">
      <TaskDetailSubtasks relationships={relationships} onOpenRelatedTask={() => {}} />
    </div>
  )
}

const manySubtasks: DartTask[] = Array.from({ length: 6 }, (_, index) => ({
  ...fixtureSubtasks[0],
  id: `fixtureSub${String(index).padStart(2, '0')}`,
  title: `Follow-up step ${index + 1}`
}))

const defaultView = defineFixture({
  width: 780,
  render: () => frame({ tasks: fixtureSubtasks, total: fixtureSubtasks.length, complete: true })
})

export const truncated = defineFixture({
  width: 780,
  render: () => frame({ tasks: manySubtasks, total: 340, complete: false })
})

export { defaultView as default }
