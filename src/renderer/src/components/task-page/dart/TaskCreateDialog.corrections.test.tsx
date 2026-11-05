// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DartWorkspaceConfig } from '../../../../../shared/dart/dart-types'
import type { DartCreateTaskArgs } from '../../../../../shared/rpc-contract/dart-params'
import { getDefaultSettings } from '../../../../../shared/constants'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import {
  installFakeDartRuntime,
  type FakeDartHost
} from '@/store/slices/dart/dart-fake-runtime.test-support'
import { getDartReadScope } from '@/store/slices/dart/dart-read-coordination'
import type { DartCreateDraft } from './dart-detail-contracts'
import { TaskPageDartCreateDialog, type DartCreateDialogModel } from './TaskCreateDialog'
import {
  useTaskPageDartCreation,
  type TaskPageDartCreationInput
} from './use-task-page-dart-creation'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const viewer = { id: 'uSeR1d2e3f4g', name: 'Alex Example' }

const config: DartWorkspaceConfig = {
  dartboards: ['Example/Platform', 'Example/Platform/Search'],
  statuses: ['To-do', 'Doing', 'Done'],
  types: [],
  tags: ['backend', 'search'],
  priorities: ['High', 'Medium'],
  sizes: [],
  assignees: ['Alex Example']
}

const realWindow = window
let host: FakeDartHost

/** The fake stubs a bare `window`, which React DOM cannot render into, so its API moves onto the real one. */
function setUpFakeRuntime(): void {
  const runtime = installFakeDartRuntime()
  const api = window.api
  vi.stubGlobal('window', realWindow)
  Object.assign(realWindow, { api })
  host = runtime.host(null)
}

beforeEach(() => {
  setUpFakeRuntime()
  const settings = { ...getDefaultSettings('/home/alex'), activeRuntimeEnvironmentId: null }
  useAppStore.setState({
    dartCreateSessions: {},
    settings,
    persistedUIReady: true,
    activeView: 'tasks',
    dartStatus: { connected: true, viewer },
    dartStatusContextKey: getDartReadScope(settings).contextKey,
    dartStatusChecked: true,
    dartUpdateRequired: false
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
type Harness = {
  model: () => DartCreateDialogModel
  createCalls: DartCreateTaskArgs[]
  /** The order of the success steps: the pinned row is noted before the refresh. */
  order: string[]
  setDraft: (patch: Partial<DartCreateDraft>) => void
  newTaskButton: () => HTMLElement
}

/** Renders the real "New task" button and the real dialog over the real creation hook and store action. */
function renderCreateHarness(
  overrides: Partial<TaskPageDartCreationInput> = {},
  discardCreateDraft?: () => void,
  modelOverrides: Partial<DartCreateDialogModel> = {}
): Harness {
  const createCalls: DartCreateTaskArgs[] = []
  const order: string[] = []
  let latest: DartCreateDialogModel | null = null
  function HarnessView(): React.JSX.Element {
    const dartStatus = useAppStore((state) => state.dartStatus)
    const creationInput: TaskPageDartCreationInput = {
      dartConnected: true,
      dartUpdateRequired: false,
      dartConfig: config,
      dartFilters: { mine: false, status: null, dartboard: null, search: '' },
      dartStatus: dartStatus ?? { connected: true, viewer },
      setDartRefreshNonce: (updater) => order.push(`refresh:${updater(0)}`),
      noteDartTaskCreated: (task) => order.push(`note:${task.id}`),
      openDartDetailPage: (task) => order.push(`open:${task.id}`),
      ...overrides
    }
    const model: DartCreateDialogModel = {
      ...useTaskPageDartCreation(creationInput),
      dartConfig: creationInput.dartConfig
    }
    latest = {
      ...model,
      ...modelOverrides,
      ...(discardCreateDraft ? { discardCreateDraft } : {}),
      createTask: (input: DartCreateTaskArgs) => {
        createCalls.push(input)
        return model.createTask(input)
      }
    }
    return (
      <>
        <button type="button" data-dart-new-task onClick={latest.openCreate}>
          New task
        </button>
        <TaskPageDartCreateDialog model={latest} />
      </>
    )
  }
  render(
    <TooltipProvider>
      <HarnessView />
    </TooltipProvider>
  )
  const model = (): DartCreateDialogModel => {
    if (!latest) {
      throw new Error('The create harness has not rendered yet.')
    }
    return latest
  }
  return {
    model,
    createCalls,
    order,
    setDraft: (patch) => model().setCreateDraft(patch),
    newTaskButton: () => screen.getByRole('button', { name: 'New task' })
  }
}

describe('Dart create recovery corrections', () => {
  it('sends the board chosen in the dialog', async () => {
    const user = userEvent.setup()
    renderCreateHarness()
    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(screen.getByLabelText('Title'), 'Chosen board task')
    await user.click(screen.getByRole('combobox', { name: 'Dartboard' }))
    await user.click(screen.getByRole('option', { name: 'Example/Platform/Search' }))
    expect(screen.getByRole('combobox', { name: 'Dartboard' })).toHaveTextContent(
      'Example/Platform/Search'
    )
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    await waitFor(() => expect(host.count('dart.createTask')).toBe(1))
    expect(host.requests.find((entry) => entry.method === 'dart.createTask')?.params).toMatchObject(
      {
        dartboard: 'Example/Platform/Search'
      }
    )
  })

  it('shows a generic token rejection without exposing the retained draft during account checking', async () => {
    const user = userEvent.setup()
    host.connection = { connected: true, viewer }
    host.refusals.push({
      ok: false,
      error: 'Private account token rejected',
      errorCode: 'dart.unauthorized'
    })
    renderCreateHarness()
    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(screen.getByLabelText('Title'), 'Private draft')
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Dart is not connected. Reconnect to Dart and try again.'
    )
    expect(screen.queryByText('Private account token rejected')).toBeNull()
    expect(screen.queryByDisplayValue('Private draft')).toBeNull()
    expect(useAppStore.getState().dartStatus?.connected).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByDisplayValue('Private draft')).toBeTruthy()
    expect(host.count('dart.status')).toBeGreaterThan(0)
  })

  it('rechecks after correcting a refused recovery and creates the displayed title and board', async () => {
    const user = userEvent.setup()
    host.lostReplies.push({ ok: false, error: 'Lost reply', outcome: 'unknown' })
    renderCreateHarness()
    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(screen.getByLabelText('Title'), 'Original title')
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    await user.click(await screen.findByRole('button', { name: 'None of these is mine' }))
    host.refusals.push({
      ok: false,
      error: 'Please correct the task.',
      errorCode: 'dart.badRequest'
    })
    await user.click(screen.getByRole('button', { name: 'Create anyway' }))
    await waitFor(() => expect(screen.getByLabelText('Title')).toBeEnabled())
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Corrected title' } })
    await user.click(screen.getByRole('combobox', { name: 'Dartboard' }))
    await user.click(screen.getByRole('option', { name: 'Example/Platform/Search' }))
    expect(screen.queryByRole('button', { name: 'Create anyway' })).toBeNull()
    expect(host.count('dart.createTask')).toBe(2)
    await user.click(screen.getByRole('button', { name: 'Check again' }))
    await user.click(await screen.findByRole('button', { name: 'None of these is mine' }))
    await user.click(await screen.findByRole('button', { name: 'Create anyway' }))
    await waitFor(() => expect(host.count('dart.createTask')).toBe(3))
    const creates = host.requests.filter((entry) => entry.method === 'dart.createTask')
    expect(creates[2].params).toMatchObject({
      title: 'Corrected title',
      dartboard: 'Example/Platform/Search'
    })
  })
})
