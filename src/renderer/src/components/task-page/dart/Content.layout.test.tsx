// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { installAppKeyboardRouter } from '@/lib/app-keyboard-router'
import { useAppStore } from '@/store'
import { dartTaskFixture } from '@/store/slices/dart/dart-fake-runtime.test-support'
import { bumpDartEpochs } from '@/store/slices/dart/dart-task-identity'
import {
  installDeliveryRuntime,
  SOURCE,
  TRANSPORTS,
  VIEWER
} from '../dart-delivery-transports.test-support'
import TaskPage from '../TaskPage'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/components/PullRequestPage', () => ({ default: () => null }))
vi.mock('@/components/GitHubItemDialog', () => ({ default: () => null }))
vi.mock('../github/List', () => ({ TaskPageGitHubList: () => null }))
vi.mock('../jira/Content', () => ({ TaskPageJiraContent: () => null }))
vi.mock('../linear/Content', () => ({ TaskPageLinearContent: () => null }))

const desktop = TRANSPORTS.find((transport) => transport.name === 'desktop IPC')!
const realWindow = window

beforeEach(() => {
  localStorage.clear()
  installDeliveryRuntime()
  const api = window.api
  vi.unstubAllGlobals()
  const quiet = new Proxy({}, { get: () => vi.fn(() => Promise.resolve(null)) })
  Object.defineProperty(realWindow, 'api', {
    value: new Proxy(api, { get: (target, key) => (key in target ? target[key] : quiet) }),
    configurable: true
  })
  installAppKeyboardRouter()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderPage(): void {
  render(
    <TooltipProvider>
      <TaskPage />
    </TooltipProvider>
  )
}

function addFinished(host: ReturnType<typeof desktop.open>, count: number): void {
  for (let index = 0; index < count; index += 1) {
    host.addTask(
      dartTaskFixture(`finishedRow${String(index).padStart(3, '0')}`, {
        title: `Finished ${index}`,
        status: 'Done',
        completedAt: new Date(Date.UTC(2026, 0, 1) + index * 60_000).toISOString()
      })
    )
  }
}

async function pickLayout(name: 'List' | 'Board'): Promise<void> {
  const radio = await screen.findByRole('radio', { name })
  await waitFor(() => expect(radio.hasAttribute('disabled')).toBe(false))
  fireEvent.click(radio)
}

describe('Dart tab layout', () => {
  it('mounts the board with its columns in board layout and the list in list layout', async () => {
    desktop.open()
    renderPage()
    await screen.findByRole('heading', { name: SOURCE.title })
    expect(document.querySelector('[data-dart-board]')).toBeNull()

    await pickLayout('Board')

    await waitFor(() => expect(document.querySelector('[data-dart-board]')).not.toBeNull())
    const column = within(document.querySelector<HTMLElement>('[data-dart-board]')!).getByRole(
      'group',
      { name: /^To-do/ }
    )
    expect(
      within(column).getByRole('button', { name: new RegExp(`^${SOURCE.title}`) })
    ).toBeTruthy()
    expect(screen.queryByRole('heading', { name: SOURCE.title })).toBeNull()

    await pickLayout('List')

    await screen.findByRole('heading', { name: SOURCE.title })
    expect(document.querySelector('[data-dart-board]')).toBeNull()
  })

  it('shows the count line for the loaded read set', async () => {
    const host = desktop.open()
    addFinished(host, 3)
    renderPage()

    expect(await screen.findByText('1 open of 1 · 3 latest done')).toBeTruthy()
  })

  it('shows "Show 50 more finished" under the list and disables it while the read runs', async () => {
    const host = desktop.open()
    addFinished(host, 60)
    renderPage()
    const more = await screen.findByRole('button', { name: 'Show 50 more finished' })
    const release = host.hold('dart.listTasks')

    fireEvent.click(more)

    await waitFor(() => expect(more.hasAttribute('disabled')).toBe(true))
    await act(async () => release())
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Show 50 more finished' })).toBeNull()
    )
    expect(
      host.requests.findLast(({ method }) => method === 'dart.listTasks')?.params
    ).toMatchObject({
      isCompleted: true,
      offset: 50
    })
  })

  it('keeps phase 2 reads on a host without the board and disables the switch', async () => {
    const host = desktop.open({ board: false })
    addFinished(host, 60)
    renderPage()

    await screen.findByRole('heading', { name: SOURCE.title })

    expect(screen.getByRole('radio', { name: 'Board' }).hasAttribute('disabled')).toBe(true)
    expect(screen.queryByRole('button', { name: 'Show 50 more finished' })).toBeNull()
    expect(host.requests.find(({ method }) => method === 'dart.listTasks')?.params).toMatchObject({
      limit: 100
    })
  })

  it('shows "Tasks changed while loading" with Retry when nothing is on screen', async () => {
    const host = desktop.open()
    const handle = host.handle.bind(host)
    host.handle = (method, params) => {
      if (method === 'dart.listTasks') {
        bumpDartEpochs({ hostKey: 'local', accountKey: VIEWER.id })
      }
      return handle(method, params)
    }
    renderPage()

    expect(
      await screen.findByText('Tasks changed while loading. Refresh to try again.')
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
    expect(useAppStore.getState().dartScopeMetaCache).not.toEqual({})
  })
})
