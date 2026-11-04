import { defineFixture } from '../../../component-fixtures/component-fixture'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { DartCreateDraft, DartWriteNotice } from './dart-detail-contracts'
import { fixtureConfig, fixtureTasks } from './dart-task.mock'
import { TaskPageDartCreateDialog, type DartCreateDialogModel } from './TaskCreateDialog'

const noop = (): void => {}

const emptyDraft: DartCreateDraft = {
  title: '',
  dartboard: '',
  description: '',
  type: '',
  status: '',
  priority: '',
  assignee: '',
  tags: [],
  dueAt: ''
}

const filledDraft: DartCreateDraft = {
  ...emptyDraft,
  title: 'Search results ignore archived projects',
  dartboard: 'Example/Platform',
  description: 'Archived projects still show their tasks in global search.',
  status: 'To-do',
  priority: 'High',
  assignee: 'Alex Example'
}

const filledConfig = {
  ...fixtureConfig,
  priorities: ['High', 'Medium', 'Low'],
  assignees: ['Alex Example']
}

const matchTask: DartTask = {
  ...fixtureTasks[0],
  id: 'nEwTaSk12345',
  title: 'Search results ignore archived projects',
  dartboard: 'Example/Platform',
  status: 'To-do'
}

function model(overrides: Partial<DartCreateDialogModel> = {}): DartCreateDialogModel {
  return {
    createUnresolved: false,
    createFieldsLocked: false,
    claimCreateMatch: noop,
    discardCreateDraft: noop,
    createOpen: true,
    createSupportsWritesV2: true,
    createSubmitting: false,
    openCreate: noop,
    closeCreate: noop,
    createTask: () => Promise.resolve({ ok: true, task: matchTask }),
    createDraft: emptyDraft,
    setCreateDraft: noop,
    createNotice: null,
    listChecked: false,
    createMatches: [],
    createMatchesTruncated: false,
    canCreateAnyway: false,
    dismissCreateNotice: noop,
    checkAgain: () => Promise.resolve(),
    dismissMatches: noop,
    createAnyway: () => Promise.resolve({ ok: true, task: matchTask }),
    dartConfig: fixtureConfig,
    openDartDetailPage: noop,
    ...overrides
  }
}

const unknownNotice: DartWriteNotice = {
  kind: 'unknown',
  message: 'Dart may have created this task. Check these before creating it again.'
}

export const empty = defineFixture({
  width: 640,
  render: () => <TaskPageDartCreateDialog model={model()} />
})

export const filled = defineFixture({
  width: 640,
  render: () => (
    <TaskPageDartCreateDialog
      model={model({ createDraft: filledDraft, dartConfig: filledConfig })}
    />
  )
})

export const withType = defineFixture({
  width: 640,
  render: () => (
    <TaskPageDartCreateDialog
      model={model({
        createDraft: { ...filledDraft, type: 'Bug' },
        dartConfig: { ...filledConfig, types: ['Bug', 'Chore'] }
      })}
    />
  )
})

export const mayHaveCreated = defineFixture({
  width: 640,
  render: () => (
    <TaskPageDartCreateDialog
      model={model({
        createDraft: filledDraft,
        dartConfig: filledConfig,
        createNotice: unknownNotice,
        createUnresolved: true,
        createFieldsLocked: true,
        listChecked: true,
        createMatches: [matchTask]
      })}
    />
  )
})

export const createAnyway = defineFixture({
  width: 640,
  render: () => (
    <TaskPageDartCreateDialog
      model={model({
        createDraft: filledDraft,
        dartConfig: filledConfig,
        createNotice: unknownNotice,
        createUnresolved: true,
        createFieldsLocked: true,
        listChecked: true,
        canCreateAnyway: true
      })}
    />
  )
})
