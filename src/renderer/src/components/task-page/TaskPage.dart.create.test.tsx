// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import type { TaskProvider } from '../../../../shared/task-providers'
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
  const settings = {
    ...getDefaultSettings('/home/alex'),
    visibleTaskProviders: ['github', 'dart'] as TaskProvider[],
    defaultTaskSource: 'dart' as TaskProvider
  }
  useAppStore.setState({
    settings,
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
})
