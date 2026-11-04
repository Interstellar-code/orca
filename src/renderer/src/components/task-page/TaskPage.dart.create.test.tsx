// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { getDefaultSettings } from '../../../../shared/constants'
import { TooltipProvider } from '@/components/ui/tooltip'
import { installAppKeyboardRouter } from '@/lib/app-keyboard-router'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { useAppStore } from '@/store'
import {
  installFakeDartRuntime,
  type FakeDartHost
} from '@/store/slices/dart/dart-fake-runtime.test-support'
import TaskPage from './TaskPage'

vi.mock('@/components/PullRequestPage', () => ({ default: () => null }))
vi.mock('@/components/GitHubItemDialog', () => ({ default: () => null }))
vi.mock('./github/List', () => ({ TaskPageGitHubList: () => <div data-testid="github-content" /> }))
vi.mock('./jira/Content', () => ({ TaskPageJiraContent: () => <div data-testid="jira-content" /> }))
vi.mock('./linear/Content', () => ({
  TaskPageLinearContent: () => <div data-testid="linear-content" />
}))

const viewer = { id: 'uSeR1d2e3f4g', name: 'Alex Example' }
const realWindow = window
let host: FakeDartHost

/** Only the Dart namespace is real; every other IPC namespace resolves quietly. */
function quietNamespace(): object {
  const uiState = { featureInteractions: {} }
  return new Proxy(
    {},
    {
      get: (_target, key) => {
        if (key === 'get' || key === 'recordFeatureInteraction') {
          return vi.fn(() => Promise.resolve(uiState))
        }
        return vi.fn(() => Promise.resolve(null))
      }
    }
  )
}

function setUpFakeRuntime(): void {
  const runtime = installFakeDartRuntime()
  const fakeApi = window.api
  vi.stubGlobal('window', realWindow)
  const quiet = quietNamespace()
  const api = new Proxy(fakeApi, {
    get: (target, key) => (key === 'dart' ? target.dart : quiet)
  })
  Object.assign(realWindow, { api })
  host = runtime.host(null)
  // The shared fake exposes no config method; this page test needs the page to load config for real.
  Object.assign(fakeApi.dart, {
    config: (params: Record<string, unknown> = {}) => host.handle('dart.config', params)
  })
  const originalHandle = host.handle.bind(host)
  host.handle = async (method, params) => {
    if (method === 'dart.config') {
      host.requests.push({ method, params })
      return {
        ok: true,
        config: {
          dartboards: ['Example/Platform'],
          statuses: ['To-do', 'Doing'],
          types: [],
          tags: [],
          priorities: [],
          sizes: [],
          assignees: []
        }
      }
    }
    if (method === 'dart.listComments') {
      host.requests.push({ method, params })
      return { ok: true, comments: [], totalCount: 0 }
    }
    return originalHandle(method, params)
  }
}

beforeEach(() => {
  setUpFakeRuntime()
  installAppKeyboardRouter()
  const settings: GlobalSettings = {
    ...getDefaultSettings('/home/alex'),
    visibleTaskProviders: ['github', 'dart'],
    defaultTaskSource: 'dart'
  }
  useAppStore.setState({
    settings,
    dartCreateSessions: {},
    persistedUIReady: true,
    activeView: 'tasks',
    taskPageData: {},
    checkLinearConnection: vi.fn(() => Promise.resolve()),
    checkJiraConnection: vi.fn(() => Promise.resolve()),
    refreshPreflightStatus: vi.fn(() => Promise.resolve()),
    dartStatus: { connected: true, viewer },
    dartStatusChecked: true,
    dartStatusContextKey: getProviderRuntimeContextKey(settings),
    dartUpdateRequired: false
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Tasks page Dart new task', () => {
  it('keeps the draft editable while config is loading', async () => {
    const user = userEvent.setup()
    const fetchConfig = useAppStore.getState().fetchDartConfig
    const pending = Promise.withResolvers<void>()
    useAppStore.setState({ fetchDartConfig: () => pending.promise.then(() => fetchConfig()) })
    render(
      <TooltipProvider>
        <TaskPage />
      </TooltipProvider>
    )
    await user.click(await screen.findByRole('button', { name: 'New task' }))
    expect(screen.getByRole('status').textContent).toContain('Loading dartboards')
    await user.type(screen.getByLabelText('Title'), 'Keep this draft')
    expect(screen.getByRole('button', { name: 'Create task' })).toBeDisabled()
    pending.resolve()
    await waitFor(() => expect(screen.queryByText('Loading dartboards…')).toBeNull())
    expect(screen.getByLabelText('Title')).toHaveValue('Keep this draft')
  })

  it('shows config failure and retries a fresh read without losing the draft', async () => {
    const user = userEvent.setup()
    const fetchConfig = useAppStore.getState().fetchDartConfig
    const fetchDartConfig = vi
      .fn(fetchConfig)
      .mockResolvedValueOnce({ ok: false, error: 'Config unavailable' })
    useAppStore.setState({ fetchDartConfig })
    render(
      <TooltipProvider>
        <TaskPage />
      </TooltipProvider>
    )
    await user.click(await screen.findByRole('button', { name: 'New task' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Config unavailable')
    expect(screen.queryByText('Loading dartboards…')).toBeNull()
    await user.type(screen.getByLabelText('Title'), 'Keep this draft')
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(fetchDartConfig).toHaveBeenLastCalledWith({ force: true })
    expect(screen.getByLabelText('Title')).toHaveValue('Keep this draft')
    expect(screen.getByRole('button', { name: 'Create task' })).toBeEnabled()
  })

  it('opens the create dialog from the New task button in the filters row', async () => {
    const user = userEvent.setup()
    render(
      <TooltipProvider>
        <TaskPage />
      </TooltipProvider>
    )

    await user.click(await screen.findByRole('button', { name: 'New task' }))

    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.getByLabelText('Title')).toBeTruthy()
  })

  it('closes the dialog and keeps the draft', async () => {
    const user = userEvent.setup()
    render(
      <TooltipProvider>
        <TaskPage />
      </TooltipProvider>
    )

    await user.click(await screen.findByRole('button', { name: 'New task' }))
    await user.type(await screen.findByLabelText('Title'), 'Ship the fix')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await user.click(screen.getByRole('button', { name: 'New task' }))
    expect(await screen.findByLabelText('Title')).toHaveValue('Ship the fix')
  })

  it('closes only the dialog when Escape lands outside a field', async () => {
    const user = userEvent.setup()
    const closeTaskPage = vi.fn()
    useAppStore.setState({ closeTaskPage })
    render(
      <TooltipProvider>
        <TaskPage />
      </TooltipProvider>
    )

    await user.click(await screen.findByRole('button', { name: 'New task' }))
    await screen.findByRole('dialog')
    // The dialog heading is not an input, so the page's own Escape handler would close the page.
    await user.click(screen.getByText('New Dart task'))
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(closeTaskPage).not.toHaveBeenCalled()
  })

  it('opens the created task and pins its row before the list refresh', async () => {
    const user = userEvent.setup()
    const originalHandle = host.handle.bind(host)
    host.handle = async (method, params) => {
      const reply = await originalHandle(method, params)
      if (method === 'dart.listTasks' && 'ok' in reply && reply.ok) {
        return { ...reply, tasks: [], totalCount: 0 }
      }
      return reply
    }
    render(
      <TooltipProvider>
        <TaskPage />
      </TooltipProvider>
    )

    await user.click(await screen.findByRole('button', { name: 'New task' }))
    await user.type(await screen.findByLabelText('Title'), 'Ship the fix')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create task' })).toHaveProperty('disabled', false)
    )
    await user.click(screen.getByRole('button', { name: 'Create task' }))

    await waitFor(() => expect(host.count('dart.createTask')).toBe(1))
    await waitFor(() =>
      expect(useAppStore.getState().taskPageData.openDartTask?.title).toBe('Ship the fix')
    )
    expect(screen.getAllByText('Ship the fix').length).toBeGreaterThan(0)
  })
})
