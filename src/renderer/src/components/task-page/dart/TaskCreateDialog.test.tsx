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
  dartTaskFixture,
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

const { toastSuccess } = vi.hoisted(() => ({ toastSuccess: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: vi.fn() } }))

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

/** The fake always creates under this id, so a test can hide it from a list reply. */
const CREATED_TASK_ID = 'nEwTaSk12345'

/** The fake stubs a bare `window`, which React DOM cannot render into, so its API moves onto the real one. */
function setUpFakeRuntime(): void {
  const runtime = installFakeDartRuntime()
  const api = window.api
  vi.stubGlobal('window', realWindow)
  Object.assign(realWindow, { api })
  host = runtime.host(null)
}

type ListReply = { ok: boolean; tasks?: { id: string }[]; totalCount?: number }

function isListReply(value: unknown): value is ListReply {
  return typeof value === 'object' && value !== null && 'ok' in value
}
/** Hides one task from list replies, so a lookup can find nothing of the same title. */
function hideTaskFromLists(target: FakeDartHost, taskId: string): void {
  const handle = target.handle.bind(target)
  target.handle = async (method, params) => {
    const raw: unknown = await handle(method, params)
    const reply = isListReply(raw) ? raw : { ok: false }
    if (method === 'dart.listTasks' && reply.ok && reply.tasks) {
      const tasks = reply.tasks.filter((task) => task.id !== taskId)
      return { ...reply, tasks, totalCount: tasks.length }
    }
    return reply
  }
}

beforeEach(() => {
  setUpFakeRuntime()
  toastSuccess.mockClear()
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
function renderCreateHarness(overrides: Partial<TaskPageDartCreationInput> = {}): Harness {
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

describe('Dart create dialog', () => {
  it('keeps submit disabled until the title is filled', async () => {
    const user = userEvent.setup()
    renderCreateHarness()

    await user.click(screen.getByRole('button', { name: 'New task' }))
    const submit = screen.getByRole('button', { name: 'Create task' })
    expect(submit).toHaveProperty('disabled', true)

    await user.type(screen.getByLabelText('Title'), 'Ship the fix')
    expect(submit).toHaveProperty('disabled', false)
  })

  it('sends the canonical values once', async () => {
    const user = userEvent.setup()
    renderCreateHarness()

    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(screen.getByLabelText('Title'), 'Ship the fix')
    await user.click(screen.getByRole('button', { name: 'Create task' }))

    await waitFor(() => expect(host.count('dart.createTask')).toBe(1))
    const request = host.requests.find((entry) => entry.method === 'dart.createTask')
    expect(request?.params).toMatchObject({ title: 'Ship the fix', dartboard: 'Example/Platform' })
  })

  it('opens the created task, pins its row before the refresh and toasts', async () => {
    const user = userEvent.setup()
    const harness = renderCreateHarness()

    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(screen.getByLabelText('Title'), 'Ship the fix')
    await user.click(screen.getByRole('button', { name: 'Create task' }))

    await waitFor(() => expect(harness.order.length).toBe(3))
    // The pinned row must not outlive a later host switch, so it is noted before the refresh.
    expect(harness.order).toEqual([
      `note:${CREATED_TASK_ID}`,
      'refresh:1',
      `open:${CREATED_TASK_ID}`
    ])
    expect(toastSuccess).toHaveBeenCalledWith('Created')
  })

  it('keeps the draft and shows the message when the host refuses the write', async () => {
    const user = userEvent.setup()
    host.refusals.push({ ok: false, error: 'Title is too long.', errorCode: 'dart.badRequest' })
    renderCreateHarness()

    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(screen.getByLabelText('Title'), 'Ship the fix')
    await user.click(screen.getByRole('button', { name: 'Create task' }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByLabelText('Title')).toHaveValue('Ship the fix')
  })

  it('refuses a board that is not in the workspace config', async () => {
    const user = userEvent.setup()
    const harness = renderCreateHarness()

    await user.click(screen.getByRole('button', { name: 'New task' }))
    harness.setDraft({ dartboard: 'Example/Gone' })
    await user.type(screen.getByLabelText('Title'), 'Ship the fix')
    await user.click(screen.getByRole('button', { name: 'Create task' }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(host.count('dart.createTask')).toBe(0)
  })

  it('offers a type only when the config has types, and omits it from the request when empty', async () => {
    const user = userEvent.setup()
    renderCreateHarness()
    await user.click(screen.getByRole('button', { name: 'New task' }))
    expect(screen.queryByRole('combobox', { name: 'Type' })).toBeNull()
    cleanup()

    renderCreateHarness({ dartConfig: { ...config, types: ['Bug', 'Chore'] } })
    await user.click(screen.getByRole('button', { name: 'New task' }))
    expect(await screen.findByRole('combobox', { name: 'Type' })).toBeTruthy()
    await user.type(screen.getByLabelText('Title'), 'Ship the fix')
    await user.click(screen.getByRole('button', { name: 'Create task' }))

    await waitFor(() => expect(host.count('dart.createTask')).toBe(1))
    const request = host.requests.find((entry) => entry.method === 'dart.createTask')
    expect(request?.params).not.toHaveProperty('type')
  })
})
describe('Dart create dialog lookup regressions', () => {
  it('reports a failed exact-title lookup and does not unlock another create', async () => {
    const user = userEvent.setup()
    host.lostReplies.push({ ok: false, error: 'socket closed', outcome: 'unknown' })
    host.failReads = true
    renderCreateHarness()

    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(screen.getByLabelText('Title'), 'Ship the fix')
    await user.click(screen.getByRole('button', { name: 'Create task' }))

    expect(await screen.findByText(/could not check whether dart created this task/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Create anyway' })).toBeNull()
    expect(host.count('dart.createTask')).toBe(1)
  })

  it('hides Create anyway when the lookup is truncated', async () => {
    const user = userEvent.setup()
    hideTaskFromLists(host, CREATED_TASK_ID)
    const handle = host.handle.bind(host)
    host.handle = async (method, params) => {
      const reply = await handle(method, params)
      if (method === 'dart.listTasks' && isListReply(reply) && reply.ok) {
        return { ...reply, totalCount: (reply.totalCount ?? 0) + 1 }
      }
      return reply
    }
    host.lostReplies.push({ ok: false, error: 'socket closed', outcome: 'unknown' })
    renderCreateHarness()

    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(screen.getByLabelText('Title'), 'Ship the fix')
    await user.click(screen.getByRole('button', { name: 'Create task' }))

    expect(await screen.findByText(/more tasks exist/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Create anyway' })).toBeNull()
    expect(host.count('dart.createTask')).toBe(1)
  })

  it('forces an exact-title lookup on the host the create went to', async () => {
    const user = userEvent.setup()
    host.lostReplies.push({ ok: false, error: 'socket closed', outcome: 'unknown' })
    renderCreateHarness()

    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(screen.getByLabelText('Title'), 'Ship the fix')
    await user.click(screen.getByRole('button', { name: 'Create task' }))

    await waitFor(() => expect(host.count('dart.listTasks')).toBeGreaterThan(0))
    const lookup = host.requests.find((entry) => entry.method === 'dart.listTasks')
    expect(lookup?.params).toEqual({
      title: 'Ship the fix',
      dartboard: 'Example/Platform',
      limit: 100
    })
    expect(host.count('dart.createTask')).toBe(1)
  })
})

it('keeps creation disabled and explains a pending writes capability check', async () => {
  const user = userEvent.setup()
  const pending = Promise.withResolvers<boolean>()
  vi.spyOn(window.api.dart, 'supportsWritesV2').mockReturnValue(pending.promise)
  renderCreateHarness({ taskSource: 'dart' })
  await user.click(screen.getByRole('button', { name: 'New task' }))
  await user.type(screen.getByLabelText('Title'), 'Ship the fix')
  expect(screen.getByText('Checking Dart capabilities before creating this task.')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Create task' })).toBeDisabled()
  pending.resolve(true)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Create task' })).toBeEnabled())
})

describe('Dart create dialog fields and keyboard order', () => {
  it('shows due date only when the host supports writes v2', async () => {
    const user = userEvent.setup()
    const supportsWritesV2 = vi.spyOn(window.api.dart, 'supportsWritesV2').mockResolvedValue(false)
    renderCreateHarness({ taskSource: 'dart' })

    await user.click(screen.getByRole('button', { name: 'New task' }))
    await waitFor(() => expect(supportsWritesV2).toHaveBeenCalled())
    expect(screen.queryByLabelText('Due date')).toBeNull()
    cleanup()
    supportsWritesV2.mockRestore()

    renderCreateHarness({ taskSource: 'dart' })
    await user.click(screen.getByRole('button', { name: 'New task' }))
    expect(await screen.findByLabelText('Due date')).toBeTruthy()
  })

  it('enforces the title character limit and description byte limit', async () => {
    const user = userEvent.setup()
    renderCreateHarness()
    await user.click(screen.getByRole('button', { name: 'New task' }))
    const title = screen.getByLabelText('Title')
    fireEvent.change(title, { target: { value: 'T'.repeat(501) } })
    expect(title).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: 'Create task' })).toHaveProperty('disabled', true)

    fireEvent.change(title, { target: { value: 'Valid title' } })
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'd'.repeat(256 * 1024 + 1) }
    })
    expect(screen.getByLabelText('Description')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: 'Create task' })).toHaveProperty('disabled', true)
    expect(host.count('dart.createTask')).toBe(0)
  })

  it('tabs through every create field and traps focus in both directions', async () => {
    const user = userEvent.setup()
    renderCreateHarness({ taskSource: 'dart', dartConfig: { ...config, types: ['Bug'] } })
    await user.click(screen.getByRole('button', { name: 'New task' }))
    await screen.findByLabelText('Due date')
    await user.type(screen.getByLabelText('Title'), 'Ship the fix')
    const controls = [
      screen.getByLabelText('Title'),
      screen.getByLabelText('Description'),
      ...['Dartboard', 'Type', 'Status', 'Priority', 'Assignee'].map((name) =>
        screen.getByRole('combobox', { name })
      ),
      screen.getByRole('button', { name: 'Tags' }),
      screen.getByLabelText('Due date'),
      screen.getByRole('button', { name: 'Cancel' }),
      screen.getByRole('button', { name: 'Create task' })
    ]
    expect(document.activeElement).toBe(controls[0])
    for (const control of controls.slice(1)) {
      await user.tab()
      expect(document.activeElement).toBe(control)
    }
    await user.tab()
    expect(document.activeElement).toBe(controls[0])
    for (const control of controls.toReversed()) {
      await user.tab({ shift: true })
      expect(document.activeElement).toBe(control)
    }
  })

  it('sends only one create for two submits before the first settles', async () => {
    const user = userEvent.setup()
    const release = host.hold('dart.createTask')
    renderCreateHarness()
    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(screen.getByLabelText('Title'), 'Ship the fix')
    const submit = screen.getByRole('button', { name: 'Create task' })
    fireEvent.click(submit)
    fireEvent.click(submit)
    expect(submit).toBeDisabled()
    release()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(host.count('dart.createTask')).toBe(1)
    expect([...host.tasks.values()].filter((task) => task.title === 'Ship the fix')).toHaveLength(1)
  })
})

describe('Dart create dialog with a lost reply', () => {
  it('looks the task up instead of offering another create', async () => {
    const user = userEvent.setup()
    host.lostReplies.push({ ok: false, error: 'socket closed', outcome: 'unknown' })
    renderCreateHarness()

    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(screen.getByLabelText('Title'), 'Ship the fix')
    await user.click(screen.getByRole('button', { name: 'Create task' }))

    expect(await screen.findByText(/may have created this task/i)).toBeTruthy()
    await waitFor(() => expect(host.count('dart.listTasks')).toBeGreaterThan(0))
    expect(host.count('dart.createTask')).toBe(1)
    expect(screen.getByRole('button', { name: 'Create task' })).toHaveProperty('disabled', true)
  })

  it('lists only an exact title match and hides Create anyway until the user answers', async () => {
    const user = userEvent.setup()
    host.addTask(dartTaskFixture('oThEr123456', { title: 'Ship the fix tomorrow' }))
    host.lostReplies.push({ ok: false, error: 'socket closed', outcome: 'unknown' })
    renderCreateHarness()

    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(screen.getByLabelText('Title'), 'Ship the fix')
    await user.click(screen.getByRole('button', { name: 'Create task' }))

    // The write landed, so the created task is the exact match; the longer title is not.
    expect(await screen.findByRole('button', { name: 'Ship the fix' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Ship the fix tomorrow' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Create anyway' })).toBeNull()
    expect(screen.getByRole('button', { name: 'None of these is mine' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'None of these is mine' }))
    expect(await screen.findByRole('button', { name: 'Create anyway' })).toBeTruthy()
    expect(host.count('dart.createTask')).toBe(1)
  })

  it('claims a matching task, clears the draft and opens it without creating again', async () => {
    const user = userEvent.setup()
    host.lostReplies.push({ ok: false, error: 'socket closed', outcome: 'unknown' })
    const harness = renderCreateHarness()
    await user.click(harness.newTaskButton())
    await user.type(screen.getByLabelText('Title'), 'Ship the fix')
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    await user.click(await screen.findByRole('button', { name: 'This is mine' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(harness.order).toContain(`open:${CREATED_TASK_ID}`)
    expect(host.count('dart.createTask')).toBe(1)
    await user.click(harness.newTaskButton())
    expect(screen.getByLabelText('Title')).toHaveValue('')
  })

  it('disables the match link while Create anyway is submitting', async () => {
    const user = userEvent.setup()
    host.lostReplies.push({ ok: false, error: 'socket closed', outcome: 'unknown' })
    renderCreateHarness()
    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(screen.getByLabelText('Title'), 'Ship the fix')
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    await user.click(await screen.findByRole('button', { name: 'None of these is mine' }))
    const release = host.hold('dart.createTask')
    await user.click(screen.getByRole('button', { name: 'Create anyway' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ship the fix' })).toBeDisabled())
    expect(screen.getByRole('button', { name: 'This is mine' })).toBeDisabled()
    release()
  })

  it('offers Create anyway when the lookup found nothing of the same title', async () => {
    const user = userEvent.setup()
    hideTaskFromLists(host, CREATED_TASK_ID)
    host.addTask(dartTaskFixture('oThEr123456', { title: 'Ship the fix tomorrow' }))
    host.lostReplies.push({ ok: false, error: 'socket closed', outcome: 'unknown' })
    renderCreateHarness()

    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(screen.getByLabelText('Title'), 'Ship the fix')
    await user.click(screen.getByRole('button', { name: 'Create task' }))

    expect(await screen.findByRole('button', { name: 'Create anyway' })).toBeTruthy()
    expect(host.count('dart.createTask')).toBe(1)
  })

  it('keeps the unresolved lookup across close and reopen', async () => {
    const user = userEvent.setup()
    host.lostReplies.push({ ok: false, error: 'socket closed', outcome: 'unknown' })
    const harness = renderCreateHarness()

    await user.click(harness.newTaskButton())
    await user.type(screen.getByLabelText('Title'), 'Ship the fix')
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    await screen.findByText(/may have created this task/i)
    await waitFor(() => expect(host.count('dart.listTasks')).toBeGreaterThan(0))

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await user.click(harness.newTaskButton())

    expect(await screen.findByText(/may have created this task/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create task' })).toHaveProperty('disabled', true)
    expect(host.count('dart.createTask')).toBe(1)
  })

  it('does not unlock submit when the lost-reply notice is dismissed', async () => {
    const user = userEvent.setup()
    host.lostReplies.push({ ok: false, error: 'socket closed', outcome: 'unknown' })
    renderCreateHarness()

    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(screen.getByLabelText('Title'), 'Ship the fix')
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    await screen.findByText(/may have created this task/i)
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.getByRole('button', { name: 'Create task' })).toHaveProperty('disabled', true)
    expect(host.count('dart.createTask')).toBe(1)
  })

  it('keeps the dialog open when Escape lands while the create is in flight', async () => {
    const user = userEvent.setup()
    const release = host.hold('dart.createTask')
    renderCreateHarness()

    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(screen.getByLabelText('Title'), 'Ship the fix')
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    await user.keyboard('{Escape}')

    expect(screen.getByRole('dialog')).toBeTruthy()
    release()
    await waitFor(() => expect(host.count('dart.createTask')).toBe(1))
  })

  it('keeps the unresolved lookup when a match link closes the dialog', async () => {
    const user = userEvent.setup()
    host.lostReplies.push({ ok: false, error: 'socket closed', outcome: 'unknown' })
    const harness = renderCreateHarness()

    await user.click(harness.newTaskButton())
    await user.type(screen.getByLabelText('Title'), 'Ship the fix')
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    await user.click(await screen.findByRole('button', { name: 'Ship the fix' }))
    await user.click(harness.newTaskButton())

    expect(await screen.findByText(/may have created this task/i)).toBeTruthy()
    expect(host.count('dart.createTask')).toBe(1)
  })

  it('sends one create when Create anyway loses its own reply, then waits for a new lookup', async () => {
    const user = userEvent.setup()
    hideTaskFromLists(host, CREATED_TASK_ID)
    host.lostReplies.push({ ok: false, error: 'socket closed', outcome: 'unknown' })
    renderCreateHarness()

    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(screen.getByLabelText('Title'), 'Ship the fix')
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    const again = await screen.findByRole('button', { name: 'Create anyway' })
    expect(host.count('dart.createTask')).toBe(1)

    host.lostReplies.push({ ok: false, error: 'socket closed', outcome: 'unknown' })
    await user.click(again)
    await waitFor(() => expect(host.count('dart.createTask')).toBe(2))

    expect(await screen.findByText(/may have created this task/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create task' })).toHaveProperty('disabled', true)
  })
})

describe('Dart create dialog keyboard', () => {
  it('does not submit while an IME composition is active', async () => {
    const user = userEvent.setup()
    renderCreateHarness()

    await user.click(screen.getByRole('button', { name: 'New task' }))
    const title = screen.getByLabelText('Title')
    fireEvent.change(title, { target: { value: 'こうかい' } })
    fireEvent.keyDown(title, { key: 'Enter', isComposing: true })

    expect(host.count('dart.createTask')).toBe(0)
  })

  it('submits on Enter outside an IME composition', async () => {
    const user = userEvent.setup()
    renderCreateHarness()

    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(screen.getByLabelText('Title'), 'Ship the fix{Enter}')

    await waitFor(() => expect(host.count('dart.createTask')).toBe(1))
  })

  it('closes with Escape, keeps the draft and returns focus to the New task button', async () => {
    const user = userEvent.setup()
    const harness = renderCreateHarness()

    await user.click(harness.newTaskButton())
    await user.type(screen.getByLabelText('Title'), 'Ship the fix')
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(harness.newTaskButton())

    await user.click(harness.newTaskButton())
    expect(screen.getByLabelText('Title')).toHaveValue('Ship the fix')
  })

  it('shows its pending state without dropping the label once the request is slow', async () => {
    const user = userEvent.setup()
    const release = host.hold('dart.createTask')
    renderCreateHarness()

    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(screen.getByLabelText('Title'), 'Ship the fix')
    await user.click(screen.getByRole('button', { name: 'Create task' }))

    expect(await screen.findByText('Creating…')).toBeTruthy()
    // The label stays in place under the spinner, so the button keeps its size.
    expect(screen.getByText('Create task')).toBeTruthy()
    release()
  })
})
describe('Dart create dialog session ownership', () => {
  it('keeps the unknown lock across an unmount and remount of the page hook', async () => {
    const user = userEvent.setup()
    host.lostReplies.push({ ok: false, error: 'socket closed', outcome: 'unknown' })
    const first = renderCreateHarness()

    await user.click(first.newTaskButton())
    await user.type(screen.getByLabelText('Title'), 'Ship the fix')
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    await screen.findByText(/may have created this task/i)
    cleanup()

    renderCreateHarness()
    await user.click(screen.getByRole('button', { name: 'New task' }))
    expect(screen.getByLabelText('Title')).toHaveValue('Ship the fix')
    expect(screen.getByRole('button', { name: 'Create task' })).toHaveProperty('disabled', true)
    expect(host.count('dart.createTask')).toBe(1)
  })

  it('keeps Check again and Discard draft available after Dismiss', async () => {
    const user = userEvent.setup()
    hideTaskFromLists(host, CREATED_TASK_ID)
    host.lostReplies.push({ ok: false, error: 'socket closed', outcome: 'unknown' })
    const harness = renderCreateHarness()

    await user.click(harness.newTaskButton())
    await user.type(screen.getByLabelText('Title'), 'Ship the fix')
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    await screen.findByText(/may have created this task/i)
    expect(await screen.findByRole('button', { name: 'Create anyway' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.getByRole('button', { name: 'Check again' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Discard draft' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create task' })).toHaveProperty('disabled', true)
  })
})

it('closes the open dialog when the host or Dart account changes', async () => {
  const user = userEvent.setup()
  const harness = renderCreateHarness()
  await user.click(harness.newTaskButton())
  await user.type(screen.getByLabelText('Title'), 'Account A draft')
  useAppStore.setState({ dartStatus: { connected: true, viewer: { id: 'user-b', name: 'B' } } })
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  await user.click(harness.newTaskButton())
  expect(screen.getByLabelText('Title')).toHaveValue('')

  const settings = { ...getDefaultSettings('/home/alex'), activeRuntimeEnvironmentId: 'host-b' }
  useAppStore.setState({
    settings,
    dartStatus: { connected: true, viewer },
    dartStatusContextKey: getDartReadScope(settings).contextKey
  })
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  await user.click(harness.newTaskButton())
  expect(screen.getByLabelText('Title')).toHaveValue('')
})

it('shows account B an empty dialog after account A lost a create reply', async () => {
  const user = userEvent.setup()
  host.lostReplies.push({ ok: false, error: 'socket closed', outcome: 'unknown' })
  const harness = renderCreateHarness()
  await user.click(harness.newTaskButton())
  await user.type(screen.getByLabelText('Title'), 'A private task')
  await user.click(screen.getByRole('button', { name: 'Create task' }))
  await screen.findByText(/may have created this task/i)

  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  useAppStore.setState({ dartStatus: { connected: true, viewer: { id: 'user-b', name: 'B' } } })
  await user.click(screen.getByRole('button', { name: 'New task' }))
  expect(screen.getByLabelText('Title')).toHaveValue('')
  await user.type(screen.getByLabelText('Title'), 'B task')
  expect(screen.getByRole('button', { name: 'Create task' })).toBeEnabled()
})

it('keeps ordinary create disabled when an unresolved draft becomes editable', async () => {
  const user = userEvent.setup()
  host.lostReplies.push({ ok: false, error: 'socket closed', outcome: 'unknown' })
  const harness = renderCreateHarness()
  await user.click(harness.newTaskButton())
  await user.type(screen.getByLabelText('Title'), 'Ship the fix')
  await user.click(screen.getByRole('button', { name: 'Create task' }))
  await screen.findByRole('button', { name: 'This is mine' })
  const key = JSON.stringify(['local', 'create', viewer.id])
  useAppStore.getState().patchDartCreateSession(key, { editable: true, notice: null })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Create task' })).toBeDisabled())
  expect(
    screen.getByRole('button', { name: 'Check again' }).querySelector('.animate-spin')
  ).toBeNull()
  expect(host.count('dart.createTask')).toBe(1)
})

describe('Dart create dialog recovery guards', () => {
  it('keeps ordinary Create task disabled while unresolved and shows recovery guidance', async () => {
    const user = userEvent.setup()
    host.lostReplies.push({ ok: false, error: 'socket closed', outcome: 'unknown' })
    renderCreateHarness()
    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(screen.getByLabelText('Title'), 'Ship the fix')
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    expect(await screen.findByText(/may have created this task/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create task' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Check again' })).toBeVisible()
  })

  it('disables recovery controls while submitting or looking up', async () => {
    const user = userEvent.setup()
    host.lostReplies.push({ ok: false, error: 'socket closed', outcome: 'unknown' })
    renderCreateHarness()
    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(screen.getByLabelText('Title'), 'Ship the fix')
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    expect(await screen.findByText(/may have created this task/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Check again' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Discard draft' })).toBeEnabled()
  })

  it('cancels discard confirmation with Cancel and Escape, then confirms discard', async () => {
    const user = userEvent.setup()
    const discard = vi.fn()
    const harness = renderCreateHarness()
    await user.click(harness.newTaskButton())
    await user.type(screen.getByLabelText('Title'), 'Ship the fix')
    // Establish unresolved state through the real lost-reply flow.
    host.lostReplies.push({ ok: false, error: 'socket closed', outcome: 'unknown' })
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    await screen.findByRole('button', { name: 'Discard draft' })
    harness.model().discardCreateDraft = discard
    await user.click(screen.getByRole('button', { name: 'Discard draft' }))
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Discard draft' }))
    await user.click(screen.getByRole('button', { name: 'Discard draft' }))
  })

  it('isolates an unresolved draft when the active Dart account changes', async () => {
    const user = userEvent.setup()
    host.lostReplies.push({ ok: false, error: 'socket closed', outcome: 'unknown' })
    const harness = renderCreateHarness()
    await user.click(harness.newTaskButton())
    await user.type(screen.getByLabelText('Title'), 'Account private task')
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    expect(await screen.findByText(/may have created this task/i)).toBeTruthy()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    useAppStore.setState({
      dartStatus: { connected: true, viewer: { id: 'other-user', name: 'Other User' } }
    })
    await user.click(screen.getByRole('button', { name: 'New task' }))
    expect(screen.getByLabelText('Title')).toHaveValue('')
    await user.type(screen.getByLabelText('Title'), 'Other account task')
    expect(screen.getByRole('button', { name: 'Create task' })).toBeEnabled()
  })

  it('disables recovery controls during an in-flight exact-title lookup', async () => {
    const user = userEvent.setup()
    host.lostReplies.push({ ok: false, error: 'socket closed', outcome: 'unknown' })
    const release = host.hold('dart.listTasks')
    renderCreateHarness()
    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(screen.getByLabelText('Title'), 'Lookup pending')
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    await screen.findByText(/may have created this task/i)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check again' })).toBeDisabled())
    release()
  })

  it('moves focus to the dialog body when Enter submits and no recovery button is enabled', async () => {
    const user = userEvent.setup()
    const release = host.hold('dart.createTask')
    renderCreateHarness()
    await user.click(screen.getByRole('button', { name: 'New task' }))
    const title = screen.getByLabelText('Title')
    await user.type(title, 'Ship the fix')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveFocus())
    release()
  })
})
