import { defineFixture } from '../../../component-fixtures/component-fixture'
import type { DartDetailDescriptionApi, DartWriteNotice } from './dart-detail-contracts'
import { dartDraftKey, setDraft, type DartDescriptionDraft } from './dart-draft-store'
import { fixtureDetailTask } from './dart-task.mock'
import { DartTaskDetailDescription } from './TaskDetailDescription'

const noFields: ReadonlySet<string> = new Set()
const notRun = (): Promise<never> => Promise.reject(new Error('Fixture does not write.'))
const accountOf = (name: string) => ({ hostKey: `fixture-${name}`, accountKey: 'fixture' })

const BASE = `## Goal
Replace the bare-metal deploy with one that is reproducible and easy to roll back.

## Scope
- App image: multi-stage standalone build
- Stack compose: app + database + queue worker`

function DescriptionFixture(props: {
  name: string
  text?: string
  supportsWritesV2?: boolean
  blocked?: boolean
  notice?: DartWriteNotice
  pending?: boolean
}): React.JSX.Element {
  const { name, text = BASE, supportsWritesV2 = true, blocked, notice, pending } = props
  const api: DartDetailDescriptionApi = {
    task: { ...fixtureDetailTask, description: text },
    openUrl: fixtureDetailTask.htmlUrl,
    supportsWritesV2,
    description: { status: 'ready', value: text },
    readLatestTask: notRun,
    onSavePatch: notRun,
    registerCloseGuard: () => () => {},
    pendingFields: pending ? new Set(['description']) : noFields,
    blockedFields: blocked ? new Set(['description']) : noFields,
    notice: {
      notice: notice ?? null,
      dismissNotice: () => {},
      recheckNotice: () => Promise.resolve()
    },
    draftKey: dartDraftKey(accountOf(name), fixtureDetailTask.id, 'description')
  }
  return (
    <div className="bg-background text-foreground">
      <DartTaskDetailDescription {...api} onRetry={() => {}} />
    </div>
  )
}

function seed(name: string, lineage: DartDescriptionDraft): () => void {
  return () => {
    setDraft(dartDraftKey(accountOf(name), fixtureDetailTask.id, 'description'), lineage, {
      dirty: true
    })
  }
}

const edited = BASE.replace('database + queue worker', 'database + cache + queue worker')
const clickButton =
  (name: string) =>
  (frame: HTMLElement): void => {
    for (const button of frame.querySelectorAll('button')) {
      if (button.textContent === name) {
        button.click()
      }
    }
  }

export const view = defineFixture({
  width: 780,
  render: () => <DescriptionFixture name="view" />
})

export const editor = defineFixture({
  width: 780,
  setup: seed('editor', { base: BASE, draft: edited, unresolved: [] }),
  render: () => <DescriptionFixture name="editor" />
})

export const preview = defineFixture({
  width: 780,
  setup: seed('preview', { base: BASE, draft: edited, unresolved: [] }),
  render: () => <DescriptionFixture name="preview" />,
  interact: clickButton('Preview')
})

export const saving = defineFixture({
  width: 780,
  setup: seed('saving', { base: BASE, draft: edited, unresolved: [] }),
  render: () => <DescriptionFixture name="saving" pending />,
  // The Saving label waits out a quick save.
  interact: () => new Promise((resolve) => setTimeout(resolve, 300))
})

export const unresolvedHunks = defineFixture({
  width: 780,
  setup: seed('unresolved', {
    base: BASE,
    draft: edited,
    unresolved: [
      { id: 'one', baseText: 'multi-stage standalone', userText: 'single-stage slim' },
      { id: 'two', baseText: 'Replace the bare-metal deploy', userText: '' }
    ]
  }),
  render: () => <DescriptionFixture name="unresolved" />
})

export const refusedNotice = defineFixture({
  width: 780,
  setup: seed('refused', { base: BASE, draft: edited, unresolved: [] }),
  render: () => (
    <DescriptionFixture
      name="refused"
      notice={{
        kind: 'refused',
        field: 'description',
        message: 'Dart did not accept this change.'
      }}
    />
  )
})

export const unknownNotice = defineFixture({
  width: 780,
  setup: seed('unknown', { base: BASE, draft: edited, unresolved: [] }),
  render: () => (
    <DescriptionFixture
      name="unknown"
      blocked
      notice={{
        kind: 'unknown',
        field: 'description',
        message: 'Dart may have applied this change. Showing what Dart had when Orca last checked.',
        checkedAt: Date.UTC(2026, 10, 4, 12, 0, 0)
      }}
    />
  )
})

export const readOnlyEmpty = defineFixture({
  width: 780,
  render: () => <DescriptionFixture name="empty" text="" />
})

export const readOnlyOldHost = defineFixture({
  width: 780,
  render: () => <DescriptionFixture name="old-host" supportsWritesV2={false} />,
  // The update hint waits out the capability probe.
  interact: () => new Promise((resolve) => setTimeout(resolve, 500))
})
