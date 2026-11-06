// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { getDefaultSettings } from '../../../../shared/constants'
import type { DartTask } from '../../../../shared/dart/dart-types'
import type { TaskProvider } from '../../../../shared/task-providers'
import type { TaskProviderErrorCode } from '../../../../shared/task-provider-failure'
import { installAppKeyboardRouter } from '@/lib/app-keyboard-router'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { useAppStore } from '@/store'
import TaskPage from './TaskPage'

// The GitHub detail pages pull in the real editor, whose document listeners reject asynchronously under happy-dom.
vi.mock('@/components/PullRequestPage', () => ({ default: () => null }))
vi.mock('@/components/GitHubItemDialog', () => ({ default: () => null }))
vi.mock('./github/List', () => ({
  TaskPageGitHubList: () => <div data-testid="github-content" />
}))
vi.mock('./jira/Content', () => ({
  TaskPageJiraContent: () => <div data-testid="jira-content" />
}))
vi.mock('./linear/Content', () => ({
  TaskPageLinearContent: () => <div data-testid="linear-content" />
}))

const viewer = { id: 'uSeR1d2e3f4g', name: 'Alex Example' }

function makeTask(overrides: Partial<DartTask> = {}): DartTask {
  return {
    id: 'aB3dE5gH7jK9',
    title: 'Search results ignore archived projects',
    htmlUrl: 'https://app.dartai.com/t/aB3dE5gH7jK9-search-results',
    dartboard: 'Example/Platform',
    status: 'Doing',
    priority: 'High',
    assignee: 'Alex Example',
    tags: [],
    updatedAt: '2026-10-30T10:00:00.000Z',
    ...overrides
  }
}

type DartStoreSeed = {
  tasks?: DartTask[]
  totalCount?: number
  connected?: boolean
  updateRequired?: boolean
  statusChecked?: boolean
  listFailure?: { error: string; errorCode: TaskProviderErrorCode }
}

// Every IPC namespace resolves quietly; the tests drive Dart state through the store.
function stubWindowApi(): void {
  const namespace = new Proxy({}, { get: () => vi.fn(() => Promise.resolve(null)) })
  Object.defineProperty(window, 'api', {
    value: new Proxy({}, { get: () => namespace }),
    configurable: true
  })
}

function seedTasksPage(
  visibleTaskProviders: TaskProvider[],
  defaultTaskSource: TaskProvider = 'github',
  dart: DartStoreSeed = {}
) {
  const settings = {
    ...getDefaultSettings('/home/alex'),
    visibleTaskProviders,
    defaultTaskSource
  }
  const tasks = dart.tasks ?? [makeTask()]
  const listDartTasks = vi.fn(() =>
    Promise.resolve(
      dart.listFailure
        ? { ok: false as const, ...dart.listFailure }
        : {
            ok: true as const,
            tasks,
            totalCount: dart.totalCount ?? tasks.length
          }
    )
  )
  const checkDartConnection = vi.fn(() => Promise.resolve())
  useAppStore.setState({
    settings,
    persistedUIReady: true,
    activeView: 'tasks',
    taskPageData: {},
    // Other providers' probes would overwrite status with the quiet IPC stub.
    checkLinearConnection: vi.fn(() => Promise.resolve()),
    checkJiraConnection: vi.fn(() => Promise.resolve()),
    refreshPreflightStatus: vi.fn(() => Promise.resolve()),
    dartStatus:
      dart.connected === false ? { connected: false, viewer: null } : { connected: true, viewer },
    dartStatusChecked: dart.statusChecked ?? true,
    dartStatusContextKey: getProviderRuntimeContextKey(settings),
    dartUpdateRequired: dart.updateRequired ?? false,
    checkDartConnection,
    listDartTasks,
    fetchDartConfig: vi.fn(() =>
      Promise.resolve({
        ok: true as const,
        config: {
          dartboards: ['Example/Platform', 'Example/Platform/Search'],
          statuses: ['To-do', 'Doing', 'Done'],
          types: [],
          tags: [],
          priorities: [],
          sizes: [],
          assignees: []
        }
      })
    ),
    fetchDartTask: vi.fn((taskId: string) =>
      Promise.resolve({
        ok: true as const,
        task: {
          ...(tasks.find((task) => task.id === taskId) ?? makeTask()),
          description: 'Body'
        }
      })
    ),
    listDartComments: vi.fn(() =>
      Promise.resolve({ ok: true as const, comments: [], totalCount: 0 })
    )
  })
  return { listDartTasks, checkDartConnection }
}

function renderTaskPage(): void {
  render(
    <TooltipProvider>
      <TaskPage />
    </TooltipProvider>
  )
}

beforeEach(() => {
  stubWindowApi()
  installAppKeyboardRouter()
})
afterEach(cleanup)

describe('Tasks page Dart tab', () => {
  it('renders no Dart tab unless Dart is a visible provider', () => {
    seedTasksPage(['github', 'linear', 'jira'])
    renderTaskPage()
    expect(document.querySelector('[data-task-source="github"]')).not.toBeNull()
    expect(document.querySelector('[data-task-source="dart"]')).toBeNull()
  })

  it('shows Dart content, and never Linear or Jira content, after clicking the rendered tab', async () => {
    seedTasksPage(['github', 'linear', 'jira', 'dart'])
    renderTaskPage()
    expect(screen.getByTestId('github-content')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Dart' }))

    expect(await screen.findByText('Search results ignore archived projects')).toBeTruthy()
    expect(screen.queryByTestId('linear-content')).toBeNull()
    expect(screen.queryByTestId('jira-content')).toBeNull()
    expect(screen.queryByTestId('github-content')).toBeNull()
  })

  it('shows the Dart filters over the list', async () => {
    seedTasksPage(['github', 'dart'], 'dart')
    renderTaskPage()

    expect(await screen.findByRole('button', { name: 'Assigned to me' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Dartboard' })).toBeTruthy()
  })

  it('checks the Dart connection when Tasks opens with Dart selected, not for other providers', () => {
    const dartSelected = seedTasksPage(['github', 'dart'], 'dart', {
      statusChecked: false
    })
    renderTaskPage()
    expect(dartSelected.checkDartConnection).toHaveBeenCalled()
    cleanup()

    const githubSelected = seedTasksPage(['github', 'dart'], 'github', {
      statusChecked: false
    })
    renderTaskPage()
    expect(githubSelected.checkDartConnection).not.toHaveBeenCalled()
  })

  it('tells the user how many tasks loaded when the list is truncated', async () => {
    seedTasksPage(['github', 'dart'], 'dart', {
      tasks: [makeTask(), makeTask({ id: 'bC4eF6hI8kL0', title: 'Add CSV export' })],
      totalCount: 250
    })
    renderTaskPage()

    expect(await screen.findByText(/Showing first 2 of 250 tasks/)).toBeTruthy()
  })

  it('offers reconnect when Dart rejects the token', async () => {
    seedTasksPage(['github', 'dart'], 'dart', {
      listFailure: { error: 'Unauthorized', errorCode: 'dart.unauthorized' }
    })
    renderTaskPage()

    expect(await screen.findByText('Dart rejected the API token.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect Dart' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
  })

  it('asks for a server update and offers no connect or list on an old remote server', () => {
    const { listDartTasks } = seedTasksPage(['github', 'dart'], 'dart', {
      connected: false,
      updateRequired: true
    })
    renderTaskPage()

    expect(screen.getByText('Update the remote Orca server to use Dart.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Connect Dart' })).toBeNull()
    expect(listDartTasks).not.toHaveBeenCalled()
  })

  it('offers to connect when Dart is not connected', () => {
    const { listDartTasks } = seedTasksPage(['github', 'dart'], 'dart', {
      connected: false
    })
    renderTaskPage()

    expect(screen.getByRole('button', { name: 'Connect Dart' })).toBeTruthy()
    expect(listDartTasks).not.toHaveBeenCalled()
  })

  it('shows no link and the invalid-link notice for a task whose URL failed validation', async () => {
    const task = makeTask({ htmlUrl: '' })
    seedTasksPage(['github', 'dart'], 'dart', { tasks: [task] })
    useAppStore.setState({
      taskPageData: { taskSource: 'dart', openDartTask: task }
    })
    renderTaskPage()

    expect(await screen.findByText(/could not verify, so it is not shown/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Open in Dart/ })).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('offers Open in Dart for a task with a verified URL', async () => {
    const task = makeTask()
    seedTasksPage(['github', 'dart'], 'dart', { tasks: [task] })
    useAppStore.setState({
      taskPageData: { taskSource: 'dart', openDartTask: task }
    })
    renderTaskPage()

    expect(await screen.findByRole('button', { name: 'Open in Dart' })).toBeTruthy()
    expect(screen.queryByText(/could not verify/)).toBeNull()
  })
})

describe('Escape on the Tasks page', () => {
  function pressEscape(): void {
    act(() => {
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true
        })
      )
    })
  }

  it('closes the page from the list', async () => {
    seedTasksPage(['github', 'dart'], 'dart')
    const closeTaskPage = vi.fn()
    useAppStore.setState({ closeTaskPage })
    renderTaskPage()
    await screen.findByText('Search results ignore archived projects')

    pressEscape()

    expect(closeTaskPage).toHaveBeenCalledTimes(1)
  })

  it('closes the page despite a non-modal dialog elsewhere', async () => {
    seedTasksPage(['github', 'dart'], 'dart')
    const closeTaskPage = vi.fn()
    useAppStore.setState({ closeTaskPage })
    renderTaskPage()
    render(<div role="dialog" aria-label="Restart another pane" />)
    await screen.findByText('Search results ignore archived projects')

    pressEscape()

    expect(closeTaskPage).toHaveBeenCalledTimes(1)
  })

  it('leaves the page open while a Dart detail is open', async () => {
    const task = makeTask()
    seedTasksPage(['github', 'dart'], 'dart', { tasks: [task] })
    const closeTaskPage = vi.fn()
    useAppStore.setState({
      closeTaskPage,
      taskPageData: { taskSource: 'dart', openDartTask: task }
    })
    renderTaskPage()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open in Dart' })).toBeTruthy())

    pressEscape()

    expect(closeTaskPage).not.toHaveBeenCalled()
  })

  it('leaves the page open while the Dart connect dialog is open', async () => {
    seedTasksPage(['github', 'dart'], 'dart', { connected: false })
    const closeTaskPage = vi.fn()
    useAppStore.setState({ closeTaskPage })
    renderTaskPage()
    fireEvent.click(screen.getByRole('button', { name: 'Connect Dart' }))
    await screen.findByRole('dialog')

    pressEscape()

    expect(closeTaskPage).not.toHaveBeenCalled()
  })
})
