// @vitest-environment happy-dom

import { cleanup, screen } from '@testing-library/react'
import { useEffect } from 'react'
import type * as DartState from './use-task-page-dart-state'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dartTaskFixture } from '@/store/slices/dart/dart-fake-runtime.test-support'
import { prepareBoardPageEnvironment, renderPage } from '../dart-board-page.test-support'
import { TRANSPORTS } from '../dart-delivery-transports.test-support'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/components/PullRequestPage', () => ({ default: () => null }))
vi.mock('@/components/GitHubItemDialog', () => ({ default: () => null }))
vi.mock('../github/List', () => ({ TaskPageGitHubList: () => null }))
vi.mock('../jira/Content', () => ({ TaskPageJiraContent: () => null }))
vi.mock('../linear/Content', () => ({ TaskPageLinearContent: () => null }))
// Why: a stored client filter makes the list render flat, as search and the nesting toggle do.
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

function seedBlocked(host: ReturnType<typeof desktop.open>): void {
  host.addTask(
    dartTaskFixture('blocked00001', {
      title: 'Blocked task',
      status: 'On hold',
      dartboard: 'Board A',
      relationships: {
        subtaskIds: [],
        blockerIds: ['aaaaaaaaaaaa', 'bbbbbbbbbbbb'],
        blockingIds: [],
        duplicateIds: [],
        relatedIds: []
      }
    })
  )
}

describe('Dart flat list blocker markers', () => {
  it('shows blocker markers on rows of a flat list on a host with relationships', async () => {
    const host = desktop.open({ relationships: true })
    seedBlocked(host)
    renderPage()

    expect(await screen.findByText('Blocked task')).toBeTruthy()
    expect(await screen.findByLabelText('Blocked by 2')).toBeTruthy()
  })

  it('shows no markers on a host without relationships', async () => {
    const host = desktop.open()
    seedBlocked(host)
    renderPage()

    expect(await screen.findByText('Blocked task')).toBeTruthy()
    expect(screen.queryByLabelText('Blocked by 2')).toBeNull()
  })
})
