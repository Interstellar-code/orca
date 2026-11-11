// @vitest-environment happy-dom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dartTaskFixture } from '@/store/slices/dart/dart-fake-runtime.test-support'
import {
  prepareBoardPageEnvironment,
  renderPage,
  switchToBoard
} from '../dart-board-page.test-support'
import { SOURCE, TRANSPORTS } from '../dart-delivery-transports.test-support'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/components/PullRequestPage', () => ({ default: () => null }))
vi.mock('@/components/GitHubItemDialog', () => ({ default: () => null }))
vi.mock('../github/List', () => ({ TaskPageGitHubList: () => null }))
vi.mock('../jira/Content', () => ({ TaskPageJiraContent: () => null }))
vi.mock('../linear/Content', () => ({ TaskPageLinearContent: () => null }))

const desktop = TRANSPORTS.find((transport) => transport.name === 'desktop IPC')!

beforeEach(prepareBoardPageEnvironment)

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function seedOnHold(host: ReturnType<typeof desktop.open>, count: number): void {
  for (let index = 0; index < count; index += 1) {
    host.addTask(
      dartTaskFixture(`hold${String(index).padStart(8, '0')}`, {
        title: `On hold ${index}`,
        status: 'On hold',
        dartboard: 'Board A',
        relationships: {
          subtaskIds: [],
          blockerIds: [],
          blockingIds: [],
          duplicateIds: [],
          relatedIds: []
        }
      })
    )
  }
}

describe('Dart count line: on-hold tasks not checked', () => {
  it('offers Check for the unread on-hold tasks and reads the next batch on click, in list and board layouts', async () => {
    const host = desktop.open({ relationships: true })
    seedOnHold(host, 25)
    renderPage()
    await screen.findByRole('heading', { name: SOURCE.title })

    expect(await screen.findByText(/5 on-hold tasks not checked/)).toBeTruthy()

    await switchToBoard()
    expect(screen.getByText(/5 on-hold tasks not checked/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Check' }))

    await waitFor(() => expect(screen.queryByText(/on-hold tasks? not checked/)).toBeNull())
    expect(screen.queryByRole('button', { name: 'Check' })).toBeNull()
  })

  it('says "1 on-hold task not checked" for a single unread task', async () => {
    const host = desktop.open({ relationships: true })
    seedOnHold(host, 21)
    renderPage()

    expect(await screen.findByText(/1 on-hold task not checked/)).toBeTruthy()
  })

  it('shows nothing on a host without relationships', async () => {
    const host = desktop.open()
    seedOnHold(host, 25)
    renderPage()
    await screen.findByRole('heading', { name: SOURCE.title })

    expect(screen.queryByText(/not checked/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Check' })).toBeNull()
  })
})
