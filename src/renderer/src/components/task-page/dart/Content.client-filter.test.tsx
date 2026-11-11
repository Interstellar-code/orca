// @vitest-environment happy-dom

import { cleanup, screen } from '@testing-library/react'
import { useEffect } from 'react'
import type * as DartState from './use-task-page-dart-state'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  prepareBoardPageEnvironment,
  renderPage,
  seedOpenTasks
} from '../dart-board-page.test-support'
import { TRANSPORTS } from '../dart-delivery-transports.test-support'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/components/PullRequestPage', () => ({ default: () => null }))
vi.mock('@/components/GitHubItemDialog', () => ({ default: () => null }))
vi.mock('../github/List', () => ({ TaskPageGitHubList: () => null }))
vi.mock('../jira/Content', () => ({ TaskPageJiraContent: () => null }))
vi.mock('../linear/Content', () => ({ TaskPageLinearContent: () => null }))
// Why: the blocked chip is hidden on a host without relationships, so a stored value is seeded through the filter setter.
vi.mock('./use-task-page-dart-state', async (importOriginal) => {
  const actual = await importOriginal<typeof DartState>()
  return {
    ...actual,
    useTaskPageDartState: (...args: Parameters<typeof actual.useTaskPageDartState>) => {
      const model = actual.useTaskPageDartState(...args)
      const { setDartFilter } = model
      useEffect(() => setDartFilter('blockedOnHold', true), [setDartFilter])
      return model
    }
  }
})

const desktop = TRANSPORTS.find((transport) => transport.name === 'desktop IPC')!

beforeEach(prepareBoardPageEnvironment)

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Dart count line: stored blocked chip with an open total above the cap', () => {
  it(
    'does not claim client filtering on a host without relationships',
    async () => {
      const host = desktop.open()
      seedOpenTasks(host, 'Open', 1_100, 'To-do')
      renderPage()
      await screen.findAllByRole('heading')

      expect(await screen.findByText(/^Showing 1,000 of 1,101 open tasks/)).toBeTruthy()
      expect(screen.queryByText(/Filtering the first/)).toBeNull()
    },
    // Seeds and renders 1,100 tasks, slow on CI runners.
    30_000
  )

  it(
    'keeps counting the stored blocked chip as a client filter on a host with relationships',
    async () => {
      const host = desktop.open({ relationships: true })
      seedOpenTasks(host, 'Open', 1_100, 'To-do')
      renderPage()

      expect(await screen.findByText(/^Filtering the first 1,000 of 1,101 open tasks/)).toBeTruthy()
    },
    // Seeds and renders 1,100 tasks, slow on CI runners.
    30_000
  )
})
