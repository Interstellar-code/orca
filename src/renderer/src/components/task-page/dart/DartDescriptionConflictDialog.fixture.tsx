import { defineFixture } from '../../../component-fixtures/component-fixture'
import { DartDescriptionConflictDialog } from './DartDescriptionConflictDialog'

const LATEST = `## Scope
- App image: multi-stage standalone build
- Stack compose: app + database + proxy

Added in Dart: the staging host moves first.`

const EDITOR_TEXT = `## Scope
- App image: multi-stage standalone build
- Stack compose: app + database + proxy

Added in Dart: the staging host moves first.

My sentence about the rollback plan.`

const noop = (): void => {}

export const clean = defineFixture({
  width: 780,
  render: () => (
    <DartDescriptionConflictDialog
      latest={LATEST}
      editorText={EDITOR_TEXT}
      unresolved={[]}
      onBackToEditing={noop}
      onDiscard={noop}
    />
  )
})

export const withUnresolvedHunks = defineFixture({
  width: 780,
  render: () => (
    <DartDescriptionConflictDialog
      latest={LATEST}
      editorText={EDITOR_TEXT}
      unresolved={[
        { id: 'one', baseText: 'database + queue worker', userText: 'database + cache + worker' },
        { id: 'two', baseText: 'Run migrations before start.', userText: '' }
      ]}
      onBackToEditing={noop}
      onDiscard={noop}
    />
  )
})
