// @vitest-environment happy-dom

import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import { useTaskPageDartState, type TaskPageDartStateInput } from './use-task-page-dart-state'

const viewer = { id: 'uSeR1d2e3f4g', name: 'Alex Example' }
const task: DartTask = {
  id: 'aB3dE5gH7jK9',
  title: 'Search results ignore archived projects',
  htmlUrl: 'https://app.dartai.com/t/aB3dE5gH7jK9',
  tags: []
}

function setup(overrides: Partial<TaskPageDartStateInput> = {}) {
  const listDartTasks = vi.fn(() =>
    Promise.resolve({ ok: true as const, tasks: [task], totalCount: 1 })
  )
  const input: TaskPageDartStateInput = {
    taskSource: 'dart',
    dartConnected: true,
    dartStatus: { connected: true, viewer },
    dartTaskSourceContext: null,
    linearAttachmentWorkspaces: [],
    listDartTasks,
    fetchDartTask: vi.fn(() => Promise.resolve({ ok: true as const, task })),
    fetchDartConfig: vi.fn(() =>
      Promise.resolve({
        ok: true as const,
        config: {
          dartboards: ['Example/Platform', 'Example/Platform/Search'],
          statuses: ['To-do'],
          types: [],
          tags: [],
          priorities: [],
          sizes: [],
          assignees: []
        }
      })
    ),
    ...overrides
  }
  const hook = renderHook(() => useTaskPageDartState({ ...input }))
  return { listDartTasks, hook }
}

describe('useTaskPageDartState', () => {
  it("lists the signed-in user's tasks by default", async () => {
    const { listDartTasks, hook } = setup()
    await waitFor(() => expect(hook.result.current.dartTasks).toHaveLength(1))
    expect(listDartTasks).toHaveBeenLastCalledWith({
      limit: 100,
      assigneeId: viewer.id
    })
  })

  it('sends the full dartboard title, not its last segment', async () => {
    const { listDartTasks, hook } = setup()
    await waitFor(() => expect(hook.result.current.dartConfig?.dartboards).toHaveLength(2))

    act(() => hook.result.current.setDartFilter('dartboard', 'Example/Platform/Search'))

    await waitFor(() =>
      expect(listDartTasks).toHaveBeenLastCalledWith(
        expect.objectContaining({ dartboard: 'Example/Platform/Search' })
      )
    )
  })

  it('drops the assignee filter for All tasks and searches titles', async () => {
    const { listDartTasks, hook } = setup()
    await waitFor(() => expect(hook.result.current.dartTasks).toHaveLength(1))

    act(() => hook.result.current.setDartFilter('mine', false))
    act(() => hook.result.current.applyDartSearch('  archived '))

    await waitFor(() =>
      expect(listDartTasks).toHaveBeenLastCalledWith({
        limit: 100,
        title: 'archived'
      })
    )
  })

  it('does not request anything while another provider is selected', () => {
    const { listDartTasks } = setup({ taskSource: 'github' })
    expect(listDartTasks).not.toHaveBeenCalled()
  })

  it('reports a failed load with its error code', async () => {
    const { hook } = setup({
      listDartTasks: vi.fn(() =>
        Promise.resolve({
          ok: false as const,
          error: 'Unauthorized',
          errorCode: 'dart.unauthorized' as const
        })
      )
    })
    await waitFor(() => expect(hook.result.current.dartError?.code).toBe('dart.unauthorized'))
    expect(hook.result.current.dartTasks).toEqual([])
  })
})
