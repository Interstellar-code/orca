// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fixtureDetailTask } from './dart-task.mock'
import { DartTaskDetailProperties } from './TaskDetailProperties'

const NO_FIELDS: ReadonlySet<string> = new Set()
const MESSAGE = /Field options are not available from Dart right now/

afterEach(cleanup)

function renderProperties(configFailed: boolean | undefined) {
  render(
    <DartTaskDetailProperties
      task={fixtureDetailTask}
      openUrl={null}
      onUpdate={vi.fn()}
      pendingFields={NO_FIELDS}
      blockedFields={NO_FIELDS}
      config={null}
      configFailed={configFailed}
      supportsWritesV2
      viewerName={null}
    />
  )
}

describe('detail properties without a config', () => {
  it('stays quiet while the config is still loading', () => {
    renderProperties(false)

    expect(screen.queryByText(MESSAGE)).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Status' }).hasAttribute('disabled')).toBe(true)
  })

  it('says why the pickers are off once the config read failed', () => {
    renderProperties(true)

    expect(screen.getByText(MESSAGE)).toBeTruthy()
  })
})
