// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import { DART_BOARD_DRAG_TASK_MIME } from '@/lib/dart-board-drag-payload'
import { buildDartBoardColumns, buildDartCardInfo } from './dart-board-columns'
import type { DartBoardModel, DartRelationshipCacheEntry } from './dart-board-contracts'
import { fixtureBlockedOnHold, fixtureBoardConfig, fixtureBoardTasks } from './dart-task.mock'
import { writes } from './dart-task-write-state'
import { enqueueDartTaskWrite } from './dart-task-write-queue'
import { DartBoard } from './DartBoard'

const HOST_KEY = 'host-a'
const ACCOUNT_KEY = 'account-a'
const TASKS = fixtureBoardTasks.filter((task) =>
  ['eF7hI9kL1nO3', 'fG8iJ0lM2oP4', 'gH9jK1mN3pQ5', 'hI0kL2nO4qR6'].includes(task.id)
)
const TODO_TASK = TASKS.find((task) => task.status === 'To-do') ?? TASKS[0]

type MoveReply = (
  task: DartTask,
  status: string
) => Promise<Awaited<ReturnType<DartBoardModel['onMove']>>>

afterEach(() => {
  cleanup()
  writes.clear()
})

function makeModel(tasks: readonly DartTask[], onMove: DartBoardModel['onMove']): DartBoardModel {
  return {
    columns: buildDartBoardColumns(tasks, fixtureBoardConfig, { showEmptyColumns: true }),
    statuses: fixtureBoardConfig.statuses,
    hostKey: HOST_KEY,
    accountKey: ACCOUNT_KEY,
    showEmptyColumns: true,
    meta: {
      openTotal: tasks.length,
      doneTotal: 0,
      doneOffset: 0,
      generation: 1,
      fetchedAt: 0,
      incomplete: false,
      partialReason: null
    },
    hasMoreDone: false,
    doneMore: { state: 'idle', data: null, error: null, retry: () => {} },
    features: { board: true, savedViews: true },
    cardInfo: (id) => buildDartCardInfo(tasks.find((task) => task.id === id) ?? tasks[0]),
    onMove,
    showMoreDone: () => {},
    onOpenTask: () => {}
  }
}

/** Plays the store's part: the card moves before the reply, `reply` decides what stays. */
function Harness({ reply, initial = TASKS }: { reply: MoveReply; initial?: readonly DartTask[] }) {
  const [tasks, setTasks] = useState(initial)
  const model = makeModel(tasks, async (task, status) => {
    setTasks((current) => current.map((t) => (t.id === task.id ? { ...t, status } : t)))
    const result = await reply(task, status)
    setTasks((current) =>
      current.map((t) =>
        t.id === task.id ? (result.ok ? result.task : { ...t, status: task.status }) : t
      )
    )
    return result
  })
  return <DartBoard model={model} selectedTaskId={null} />
}

function moveTrigger(): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`^Move “${TODO_TASK.title}”`) })
}

function column(name: RegExp) {
  return screen.getByRole('group', { name })
}

function dropData(payload: string | null) {
  const types = payload === null ? [] : [DART_BOARD_DRAG_TASK_MIME]
  return {
    types,
    getData: (type: string) => (type === DART_BOARD_DRAG_TASK_MIME && payload ? payload : ''),
    dropEffect: 'none',
    setData: () => {},
    effectAllowed: 'all'
  }
}

function dropOn(target: HTMLElement, payload: string | null) {
  fireEvent.drop(target, { dataTransfer: dropData(payload) })
}

const ownPayload = JSON.stringify({ taskId: TODO_TASK.id, hostKey: HOST_KEY })

describe('DartBoard drop', () => {
  it('moves the card before the reply and calls onMove once', async () => {
    let finish: (() => void) | undefined
    const onReply = vi.fn(
      (task: DartTask, status: string) =>
        new Promise<{ ok: true; task: DartTask }>((resolve) => {
          finish = () => resolve({ ok: true, task: { ...task, status } })
        })
    )
    render(<Harness reply={onReply} />)
    dropOn(column(/^Doing/), ownPayload)
    expect(within(column(/^Doing/)).getByText(TODO_TASK.title)).toBeInTheDocument()
    expect(onReply).toHaveBeenCalledTimes(1)
    expect(onReply).toHaveBeenCalledWith(expect.objectContaining({ id: TODO_TASK.id }), 'Doing')
    await act(async () => finish?.())
    expect(screen.getByText('Moved to Doing')).toBeInTheDocument()
  })

  it('returns a refused card to its column with the message and focus', async () => {
    render(
      <Harness
        reply={() =>
          Promise.resolve({ ok: false, outcome: 'notApplied', error: 'Dart refused it' })
        }
      />
    )
    dropOn(column(/^Doing/), ownPayload)
    await screen.findByText('Dart refused it')
    const card = within(column(/^To-do/))
      .getByText(TODO_TASK.title)
      .closest('[data-dart-card-id]')
    expect(card).toHaveFocus()
  })

  it('moves the card to the status the reply returned', async () => {
    render(
      <Harness
        reply={(task) => Promise.resolve({ ok: true, task: { ...task, status: 'On hold' } })}
      />
    )
    dropOn(column(/^Doing/), ownPayload)
    await screen.findByText('Moved to On hold')
    expect(within(column(/^On hold/)).getByText(TODO_TASK.title)).toBeInTheDocument()
    expect(within(column(/^Doing/)).queryByText(TODO_TASK.title)).not.toBeInTheDocument()
  })

  it('does nothing for a drop on its own column', () => {
    const reply = vi.fn()
    render(<Harness reply={reply} />)
    dropOn(column(/^To-do/), ownPayload)
    expect(reply).not.toHaveBeenCalled()
  })

  it('ignores a payload from another host and a malformed one', () => {
    const reply = vi.fn()
    render(<Harness reply={reply} />)
    dropOn(column(/^Doing/), JSON.stringify({ taskId: TODO_TASK.id, hostKey: 'host-b' }))
    dropOn(column(/^Doing/), '{not json')
    expect(reply).not.toHaveBeenCalled()
    expect(within(column(/^To-do/)).getByText(TODO_TASK.title)).toBeInTheDocument()
  })

  it('sends no write for a status outside the workspace settings and announces it', async () => {
    const reply = vi.fn()
    render(<Harness reply={reply} />)
    dropOn(column(/^Archived/), ownPayload)
    expect(reply).not.toHaveBeenCalled()
    expect(
      await screen.findByText('This status is not in the workspace settings')
    ).toBeInTheDocument()
    expect(within(column(/^To-do/)).getByText(TODO_TASK.title)).toBeInTheDocument()
  })
})

describe('DartBoard card state', () => {
  it('locks a card whose status write is pending', () => {
    void enqueueDartTaskWrite({
      identity: { hostKey: HOST_KEY, accountKey: ACCOUNT_KEY, taskId: TODO_TASK.id },
      previous: TODO_TASK,
      optimistic: { status: 'Doing' },
      write: () => new Promise(() => {}),
      refresh: () => new Promise(() => {}),
      patch: () => {},
      invalidateLists: () => {}
    })
    render(<Harness reply={vi.fn()} />)
    const card = screen
      .getByText(TODO_TASK.title, { selector: 'span' })
      .closest('[data-dart-card-id]')
    expect(card).toHaveAttribute('draggable', 'false')
    expect(moveTrigger()).toBeDisabled()
  })
})

describe('DartBoard Move to', () => {
  it('works by keyboard, keeps focus on the moved card and announces it', async () => {
    const user = userEvent.setup()
    render(
      <Harness reply={(task, status) => Promise.resolve({ ok: true, task: { ...task, status } })} />
    )
    const trigger = moveTrigger()
    trigger.focus()
    await user.keyboard('{Enter}')
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Doing' }))
    await screen.findByText('Moved to Doing')
    const card = within(column(/^Doing/))
      .getByText(TODO_TASK.title)
      .closest('[data-dart-card-id]')
    expect(card).toHaveFocus()
  })

  it('closes on Escape with focus on its trigger', async () => {
    const user = userEvent.setup()
    render(<Harness reply={vi.fn()} />)
    const trigger = moveTrigger()
    trigger.focus()
    await user.keyboard('{Enter}')
    await screen.findByRole('menu')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('closes an open menu when a refresh no longer holds the task', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    const { rerender } = render(
      <DartBoard model={makeModel(TASKS, onMove)} selectedTaskId={null} />
    )
    await user.click(moveTrigger())
    await screen.findByRole('menu')
    rerender(
      <DartBoard
        model={makeModel(
          TASKS.filter((task) => task.id !== TODO_TASK.id),
          onMove
        )}
        selectedTaskId={null}
      />
    )
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('keeps the menu closed when a later refresh brings the dropped task back', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    const { rerender } = render(
      <DartBoard model={makeModel(TASKS, onMove)} selectedTaskId={null} />
    )
    await user.click(moveTrigger())
    await screen.findByRole('menu')
    const without = TASKS.filter((task) => task.id !== TODO_TASK.id)
    rerender(<DartBoard model={makeModel(without, onMove)} selectedTaskId={null} />)
    rerender(<DartBoard model={makeModel(TASKS, onMove)} selectedTaskId={null} />)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('keeps a drag cancelled when a later refresh brings the dragged task back', () => {
    const onMove = vi.fn()
    const { rerender } = render(
      <DartBoard model={makeModel(TASKS, onMove)} selectedTaskId={null} />
    )
    const card = document.querySelector(`[data-dart-card-id="${TODO_TASK.id}"]`)
    if (!card) {
      throw new Error('missing card')
    }
    fireEvent.dragStart(card, { dataTransfer: dropData(ownPayload) })
    const doing = column(/^Doing/)
    // An active drag cancels dragover's default, so fireEvent reports false.
    expect(fireEvent.dragOver(doing, { dataTransfer: dropData(ownPayload) })).toBe(false)
    const without = TASKS.filter((task) => task.id !== TODO_TASK.id)
    rerender(<DartBoard model={makeModel(without, onMove)} selectedTaskId={null} />)
    rerender(<DartBoard model={makeModel(TASKS, onMove)} selectedTaskId={null} />)
    expect(fireEvent.dragOver(column(/^Doing/), { dataTransfer: dropData(ownPayload) })).toBe(true)
  })
})

describe('DartBoard more finished', () => {
  it('shows a failed more-finished read with a Retry that reads again', async () => {
    const showMoreDone = vi.fn()
    const model: DartBoardModel = {
      ...makeModel(TASKS, vi.fn()),
      hasMoreDone: true,
      doneMore: { state: 'error', data: null, error: 'Dart is rate limited', retry: showMoreDone },
      showMoreDone
    }
    render(<DartBoard model={model} selectedTaskId={null} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Dart is rate limited')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    expect(showMoreDone).toHaveBeenCalledTimes(1)
  })

  it('shows an empty state with the more-finished button when no column has a task', () => {
    const model: DartBoardModel = { ...makeModel([], vi.fn()), hasMoreDone: true }
    render(<DartBoard model={model} selectedTaskId={null} />)

    expect(screen.getByText('No tasks match these filters.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show 50 more finished' })).toBeInTheDocument()
  })
})

describe('DartBoard card markers', () => {
  const onHold = fixtureBlockedOnHold
  const plain = TASKS.find((task) => task.status === 'Done') ?? TASKS[0]

  function modelWith(
    tasks: readonly DartTask[],
    entries: ReadonlyMap<string, DartRelationshipCacheEntry>
  ): DartBoardModel {
    return {
      ...makeModel(tasks, vi.fn()),
      cardInfo: (id) => {
        const task = tasks.find((candidate) => candidate.id === id) ?? tasks[0]
        return buildDartCardInfo(task, entries.get(id))
      }
    }
  }

  const known = (task: DartTask): DartRelationshipCacheEntry => ({
    state: 'known',
    relationships: task.relationships ?? null,
    fetchedAt: 1,
    error: null
  })

  it('labels a blocked card "Blocked by N"', () => {
    const entries = new Map([[onHold.id, known(onHold)]])
    render(<DartBoard model={modelWith([onHold], entries)} selectedTaskId={null} />)

    expect(screen.getByRole('img', { name: 'Blocked by 1' })).toBeInTheDocument()
    expect(screen.queryByText('Blockers not checked')).not.toBeInTheDocument()
  })

  it('shows both counts on a card that blocks and is blocked', () => {
    const both: DartTask = {
      ...onHold,
      relationships: {
        subtaskIds: [],
        blockerIds: ['a', 'b'],
        blockingIds: ['c'],
        duplicateIds: [],
        relatedIds: []
      }
    }
    render(
      <DartBoard
        model={modelWith([both], new Map([[both.id, known(both)]]))}
        selectedTaskId={null}
      />
    )

    expect(screen.getByRole('img', { name: 'Blocked by 2' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Blocking 1' })).toBeInTheDocument()
  })

  it('shows the subtask count from the loaded children', () => {
    const model = {
      ...makeModel([plain], vi.fn()),
      cardInfo: () => ({
        ...buildDartCardInfo(plain),
        subtasks: { loaded: 2, total: 3 }
      })
    }
    render(<DartBoard model={model} selectedTaskId={null} />)

    expect(screen.getByLabelText('Subtasks 3')).toBeInTheDocument()
  })

  it('says "Blockers not checked" on an on-hold card only', () => {
    const entries = new Map<string, DartRelationshipCacheEntry>([
      [onHold.id, { state: 'notChecked', relationships: null, fetchedAt: 0, error: null }]
    ])
    render(<DartBoard model={modelWith([onHold, plain], entries)} selectedTaskId={null} />)

    expect(screen.getAllByText('Blockers not checked')).toHaveLength(1)
    const doneCard = screen.getByText(plain.title).closest('[data-dart-card-id]') as HTMLElement
    expect(within(doneCard).queryByText('Blockers not checked')).not.toBeInTheDocument()
  })

  it('says "Blockers not checked" on an on-hold card whose relationship fetch errored', () => {
    const entries = new Map<string, DartRelationshipCacheEntry>([
      [onHold.id, { state: 'error', relationships: null, fetchedAt: 0, error: 'boom' }],
      [plain.id, { state: 'error', relationships: null, fetchedAt: 0, error: 'boom' }]
    ])
    render(<DartBoard model={modelWith([onHold, plain], entries)} selectedTaskId={null} />)

    expect(screen.getAllByText('Blockers not checked')).toHaveLength(1)
  })

  it('renders no markers on a host without relationships', () => {
    render(<DartBoard model={modelWith([onHold, plain], new Map())} selectedTaskId={null} />)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByText('Blockers not checked')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^Subtasks/)).not.toBeInTheDocument()
  })
})
