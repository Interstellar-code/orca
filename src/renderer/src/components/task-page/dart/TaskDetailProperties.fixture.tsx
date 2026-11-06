import { defineFixture } from '../../../component-fixtures/component-fixture'
import type { DartTask, DartWorkspaceConfig } from '../../../../../shared/dart/dart-types'
import type { DartDetailEditApi } from './dart-detail-contracts'
import { fixtureDetailTask } from './dart-task.mock'
import { DartTaskDetailNotice } from './TaskDetailNotice'
import { DartTaskDetailProperties } from './TaskDetailProperties'

const config: DartWorkspaceConfig = {
  dartboards: ['Example/Platform', 'Example/Platform/Search', 'Example/Design'],
  statuses: ['To-do', 'Doing', 'Blocked', 'Done'],
  types: [],
  tags: ['search', 'backend', 'billing', 'design'],
  priorities: ['Critical', 'High', 'Medium', 'Low'],
  sizes: ['1', '2', '3', '5', '8'],
  assignees: ['Alex Example', 'Sam Example', 'Riley Example']
}

const task: DartTask = {
  ...fixtureDetailTask,
  size: '3',
  startAt: '2026-11-02',
  dueAt: '2026-11-20T00:00:00.000Z'
}

const none: ReadonlySet<string> = new Set()

function editApi(overrides: Partial<DartDetailEditApi> = {}): DartDetailEditApi {
  return {
    task,
    openUrl: null,
    onUpdate: () => Promise.reject(new Error('Fixture does not write.')),
    pendingFields: none,
    blockedFields: none,
    config,
    supportsWritesV2: true,
    viewerName: 'Sam Example',
    ...overrides
  }
}

function frame(content: React.ReactNode): React.JSX.Element {
  return <div className="min-h-[360px] bg-background text-foreground">{content}</div>
}

export const editable = defineFixture({
  width: 780,
  render: () => frame(<DartTaskDetailProperties {...editApi()} />)
})

export const pending = defineFixture({
  width: 780,
  render: () =>
    frame(
      <DartTaskDetailProperties
        {...editApi({ pendingFields: new Set(['status', 'dueAt', 'tags']) })}
      />
    )
})

export const statusPickerOpen = defineFixture({
  width: 780,
  render: () => frame(<DartTaskDetailProperties {...editApi()} />),
  interact: (root) => {
    root
      .querySelector<HTMLElement>('[aria-label="Status"]')
      ?.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' })
      )
  }
})

export const assigneePickerOpen = defineFixture({
  width: 780,
  render: () => frame(<DartTaskDetailProperties {...editApi()} />),
  interact: (root) => {
    root.querySelector<HTMLElement>('[aria-label="Assignee"]')?.click()
  }
})

export const refusedEdit = defineFixture({
  width: 780,
  render: () =>
    frame(
      <>
        <div className="mx-4 mt-3">
          <DartTaskDetailNotice
            notice={{
              kind: 'refused',
              field: 'priority',
              message: 'Dart did not accept this change.'
            }}
            dismissNotice={() => {}}
            recheckNotice={() => Promise.resolve()}
          />
        </div>
        <DartTaskDetailProperties {...editApi()} />
      </>
    )
})

export const blocked = defineFixture({
  width: 780,
  render: () =>
    frame(<DartTaskDetailProperties {...editApi({ blockedFields: new Set(['status']) })} />)
})

export const oldHost = defineFixture({
  width: 780,
  render: () => frame(<DartTaskDetailProperties {...editApi({ supportsWritesV2: false })} />)
})

export const noConfig = defineFixture({
  width: 780,
  render: () => frame(<DartTaskDetailProperties {...editApi({ config: null })} />)
})
