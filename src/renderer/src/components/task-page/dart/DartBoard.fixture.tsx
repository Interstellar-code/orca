import type { DartTask, DartWorkspaceConfig } from '../../../../../shared/dart/dart-types'
import type { DartTaskIdentity } from '@/store/slices/dart/dart-task-identity'
import { dartTaskIdentityKey } from '@/store/slices/dart/dart-task-identity'
import { defineFixture } from '../../../component-fixtures/component-fixture'
import { DartBoard } from './DartBoard'
import { buildDartBoardColumns, buildDartCardInfo } from './dart-board-columns'
import type {
  DartBoardModel,
  DartRelationshipCacheEntry,
  DartScopeMeta
} from './dart-board-contracts'
import { fixtureBlockedOnHold, fixtureBoardConfig, fixtureBoardTasks } from './dart-task.mock'
import { writes } from './dart-task-write-state'

const HOST_KEY = 'local'
const ACCOUNT_KEY = 'fixture-account'

const baseTask = {
  htmlUrl: 'https://app.dartai.com/t/aB3dE5gH7jK9-example',
  assignee: 'Alex Example',
  tags: [] as string[]
}

function fixtureMeta(overrides: Partial<DartScopeMeta>): DartScopeMeta {
  return {
    openTotal: 0,
    doneTotal: 0,
    doneOffset: 0,
    generation: 1,
    fetchedAt: Date.UTC(2026, 10, 4, 12, 0, 0),
    incomplete: false,
    partialReason: null,
    ...overrides
  }
}

function buildModel(
  tasks: readonly DartTask[],
  config: DartWorkspaceConfig,
  options: { showEmptyColumns?: boolean; hasMoreDone?: boolean } = {}
): DartBoardModel {
  const columns = buildDartBoardColumns(tasks, config, {
    showEmptyColumns: options.showEmptyColumns ?? false
  })
  return {
    columns,
    statuses: config.statuses,
    hostKey: HOST_KEY,
    accountKey: ACCOUNT_KEY,
    showEmptyColumns: options.showEmptyColumns ?? false,
    meta: fixtureMeta({
      openTotal: tasks.filter((task) => !task.completedAt).length,
      doneTotal: tasks.filter((task) => task.completedAt).length
    }),
    hasMoreDone: options.hasMoreDone ?? false,
    doneMore: { state: 'idle', data: null, error: null, retry: () => {} },
    features: { board: true, savedViews: true },
    cardInfo: (taskId) => {
      const task = tasks.find((candidate) => candidate.id === taskId) ?? tasks[0]
      return buildDartCardInfo(task)
    },
    onMove: (task, status) => Promise.resolve({ ok: true, task: { ...task, status } }),
    showMoreDone: () => {},
    onOpenTask: () => {}
  }
}

const wideConfig: DartWorkspaceConfig = {
  ...fixtureBoardConfig,
  statuses: ['To-do', 'Doing', 'Blocked', 'On hold', 'In review', 'Done']
}

const manyTodoTasks: DartTask[] = Array.from({ length: 14 }, (_, index) => ({
  ...baseTask,
  id: `td${String(index).padStart(10, '0')}`,
  title: `Backlog item ${index + 1}: tidy up the billing settings copy`,
  dartboard: 'Example/Platform',
  status: 'To-do',
  priority: index % 3 === 0 ? 'High' : index % 3 === 1 ? 'Medium' : 'Low',
  updatedAt: new Date(Date.now() - (index + 1) * 3_600_000).toISOString()
}))

const wideTasks: DartTask[] = [
  ...fixtureBoardTasks.filter((task) => task.status !== 'Archived'),
  ...manyTodoTasks,
  {
    ...baseTask,
    id: 'rv0000000001',
    title: 'Review the search ranking proposal',
    dartboard: 'Example/Platform/Search',
    status: 'In review',
    priority: 'Medium',
    updatedAt: new Date(Date.now() - 6 * 3_600_000).toISOString()
  }
]

export const wide = defineFixture({
  width: 1400,
  render: () => (
    <div className="bg-background p-5 text-foreground">
      <DartBoard
        model={buildModel(wideTasks, wideConfig, { hasMoreDone: true })}
        selectedTaskId="aB3dE5gH7jK9"
      />
    </div>
  )
})

export const dragging = defineFixture({
  width: 1100,
  render: () => (
    <div className="bg-background p-5 text-foreground">
      <DartBoard model={buildModel(fixtureBoardTasks, fixtureBoardConfig)} selectedTaskId={null} />
    </div>
  ),
  interact: async (frame) => {
    const card = frame.querySelector('[data-dart-card-id]')
    const target = frame.querySelector('[data-dart-column="status:doing"]')
    if (!card || !target) {
      return
    }
    const dataTransfer = new DataTransfer()
    card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }))
    await new Promise((resolve) => setTimeout(resolve, 50))
    target.dispatchEvent(
      new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer })
    )
  }
})

const emptyColumns = defineFixture({
  width: 1100,
  render: () => (
    <div className="bg-background p-5 text-foreground">
      <DartBoard
        model={buildModel(fixtureBoardTasks.slice(0, 2), fixtureBoardConfig, {
          showEmptyColumns: true
        })}
        selectedTaskId={null}
      />
    </div>
  )
})

const unknownIdentity: DartTaskIdentity = {
  hostKey: HOST_KEY,
  accountKey: ACCOUNT_KEY,
  taskId: 'aB3dE5gH7jK9'
}

function seedUnknownNotice(): void {
  const confirmed = fixtureBoardTasks.find((task) => task.id === unknownIdentity.taskId)
  if (!confirmed) {
    return
  }
  const patch: Partial<DartTask> = { status: 'Doing' }
  writes.set(dartTaskIdentityKey(unknownIdentity), {
    identity: unknownIdentity,
    confirmed,
    pending: [],
    notices: [
      {
        patch,
        fields: ['status'],
        evidenced: false,
        notice: {
          kind: 'unknown',
          field: 'status',
          message:
            'Dart may have applied this change. Showing what Dart had when Orca last checked.',
          checkedAt: Date.UTC(2026, 10, 4, 12, 0, 0)
        }
      }
    ],
    tail: null,
    recheck: null,
    refresh: () => Promise.resolve({ ok: false, error: 'offline' }),
    patches: new Set()
  })
}

const unknownOutcome = defineFixture({
  width: 1100,
  setup: seedUnknownNotice,
  render: () => (
    <div className="bg-background p-5 text-foreground">
      <DartBoard model={buildModel(fixtureBoardTasks, fixtureBoardConfig)} selectedTaskId={null} />
    </div>
  )
})

const largeStatuses = ['To-do', 'Doing', 'Blocked', 'In review', 'Done']
const largeTasks: DartTask[] = Array.from({ length: 1000 }, (_, index) => {
  const status = largeStatuses[index % largeStatuses.length]
  const when = new Date(Date.now() - (index + 1) * 60_000).toISOString()
  return {
    ...baseTask,
    id: `lg${String(index).padStart(10, '0')}`,
    title: `Generated task ${index + 1}`,
    dartboard: 'Example/Platform',
    status,
    priority: index % 2 === 0 ? 'High' : 'Low',
    completedAt: status === 'Done' ? when : null,
    updatedAt: when
  }
})

export const large = defineFixture({
  width: 1400,
  render: () => (
    <div className="bg-background p-5 text-foreground">
      <DartBoard
        model={buildModel(largeTasks, { ...fixtureBoardConfig, statuses: largeStatuses })}
        selectedTaskId={null}
      />
    </div>
  )
})

function relationshipModel(
  tasks: readonly DartTask[],
  entryFor: (task: DartTask) => DartRelationshipCacheEntry | undefined
): DartBoardModel {
  return {
    ...buildModel(tasks, fixtureBoardConfig),
    cardInfo: (taskId) => {
      const task = tasks.find((candidate) => candidate.id === taskId) ?? tasks[0]
      return buildDartCardInfo(task, entryFor(task))
    }
  }
}

const blockedTask: DartTask = {
  ...fixtureBlockedOnHold,
  relationships: {
    subtaskIds: [],
    blockerIds: ['aaaaaaaaaaaa', 'bbbbbbbbbbbb'],
    blockingIds: ['cccccccccccc'],
    duplicateIds: [],
    relatedIds: []
  }
}

export const blockers = defineFixture({
  width: 1100,
  render: () => (
    <div className="bg-background p-5 text-foreground">
      <DartBoard
        model={relationshipModel([blockedTask, ...fixtureBoardTasks.slice(0, 2)], (task) =>
          task.id === blockedTask.id
            ? {
                state: 'known',
                relationships: task.relationships ?? null,
                fetchedAt: 1,
                error: null
              }
            : undefined
        )}
        selectedTaskId={null}
      />
    </div>
  )
})

const notChecked = defineFixture({
  width: 1100,
  render: () => (
    <div className="bg-background p-5 text-foreground">
      <DartBoard
        model={relationshipModel(fixtureBoardTasks, (task) =>
          task.status === 'On hold' || task.tags.includes('on-hold')
            ? { state: 'notChecked', relationships: null, fetchedAt: 0, error: null }
            : undefined
        )}
        selectedTaskId={null}
      />
    </div>
  )
})

export {
  notChecked as 'not-checked',
  emptyColumns as 'empty-columns',
  unknownOutcome as 'unknown-outcome'
}
