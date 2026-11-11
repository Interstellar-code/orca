// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import { TooltipProvider } from '@/components/ui/tooltip'
import { fixtureGrandchild, fixtureSubtaskParent, fixtureSubtasks } from './dart-task.mock'
import { DartCardMarkers } from './DartCardMarkers'
import { TaskPageDartTaskList } from './TaskList'
import { useStubNestedListModel, type StubNestedListOptions } from './TaskList.nested.test-support'

afterEach(cleanup)

const PARENT = fixtureSubtaskParent
const [FIRST, SECOND] = fixtureSubtasks
const HIERARCHY = [PARENT, FIRST, SECOND, fixtureGrandchild]

function noop(): void {}

function List({
  options,
  onOpenTask = noop,
  flat = false
}: {
  options: StubNestedListOptions
  onOpenTask?: (task: DartTask) => void
  flat?: boolean
}): React.JSX.Element {
  const model = useStubNestedListModel(options)
  return (
    <TooltipProvider>
      <TaskPageDartTaskList
        tasks={options.tasks}
        nested={flat ? undefined : model}
        rowMarkers={(task) => (
          <DartCardMarkers
            info={
              task.id === PARENT.id
                ? { task, blockedBy: 2, blocking: 1, onHold: false }
                : { task, onHold: true, relationshipState: 'notChecked' }
            }
          />
        )}
        selectedTaskId={null}
        getTaskWorkspaces={() => []}
        onOpenTask={onOpenTask}
        onStartWorkspace={() => {}}
        onOpenWorkspace={() => {}}
      />
    </TooltipProvider>
  )
}

const expandButton = (title: string): HTMLElement =>
  screen.getByRole('button', { name: `Expand subtasks of ${title}` })

describe('nested task list rows', () => {
  it('shows a loaded child and its grandchild under the parent, with no expand button on them', async () => {
    render(<List options={{ tasks: HIERARCHY }} />)
    expect(screen.queryByText(FIRST.title)).toBeNull()

    await userEvent.click(expandButton(PARENT.title))

    const toggle = screen.getByRole('button', { name: `Collapse subtasks of ${PARENT.title}` })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    const group = document.getElementById(toggle.getAttribute('aria-controls')!)!
    expect(within(group).getByText(FIRST.title)).toBeTruthy()
    expect(within(group).getByText(fixtureGrandchild.title)).toBeTruthy()
    expect(within(group).queryByRole('button', { name: /subtasks of/ })).toBeNull()
  })

  it('shows a child fetched on expand under its parent when the scope lacks it', async () => {
    render(<List options={{ tasks: [PARENT], fetched: { [PARENT.id]: [FIRST] } }} />)
    await userEvent.click(expandButton(PARENT.title))
    const group = screen.getByRole('group')
    expect(within(group).getByText(FIRST.title)).toBeTruthy()
  })

  it('shows an inline Retry under the parent after a failed child read', async () => {
    const retry = vi.fn()
    render(
      <List
        options={{
          tasks: [PARENT],
          failed: new Set([PARENT.id]),
          totals: { [PARENT.id]: 1 },
          retry
        }}
      />
    )
    await userEvent.click(expandButton(PARENT.title))
    await userEvent.click(within(screen.getByRole('group')).getByRole('button', { name: 'Retry' }))
    expect(retry).toHaveBeenCalledWith(PARENT.id)
  })

  it('reads "N loaded" until every child is read, then "N of M done"', () => {
    const { unmount } = render(<List options={{ tasks: HIERARCHY, totals: { [PARENT.id]: 3 } }} />)
    expect(screen.getByText('2 loaded')).toBeTruthy()
    unmount()
    render(<List options={{ tasks: HIERARCHY }} />)
    expect(screen.getByText('1 of 2 done')).toBeTruthy()
  })

  it('ends a block over 250 children with the truncation line', async () => {
    const many = Array.from({ length: 250 }, (_, index) => ({
      ...FIRST,
      id: `many${String(index).padStart(8, '0')}`
    }))
    render(<List options={{ tasks: [PARENT, ...many], totals: { [PARENT.id]: 300 } }} />)
    await userEvent.click(expandButton(PARENT.title))
    expect(
      screen.getByRole('button', { name: 'Showing 250 of 300 subtasks · Open in Dart' })
    ).toBeTruthy()
  })

  it('moves focus to the parent row when collapsing from inside a child, without scrolling', async () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    render(<List options={{ tasks: HIERARCHY, initiallyExpanded: [PARENT.id] }} />)
    const child = screen.getByText(FIRST.title).closest<HTMLElement>('[role="button"]')!
    child.focus()
    focus.mockClear()

    fireEvent.click(screen.getByRole('button', { name: `Collapse subtasks of ${PARENT.title}` }))

    const parentRow = screen.getByText(PARENT.title).closest<HTMLElement>('[role="button"]')!
    expect(document.activeElement).toBe(parentRow)
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(screen.queryByText(FIRST.title)).toBeNull()
    focus.mockRestore()
  })

  it('keeps focus in the list when the expanded parent turns out to have no children', () => {
    const { rerender } = render(<List options={{ tasks: [PARENT], totals: { [PARENT.id]: 1 } }} />)
    const button = expandButton(PARENT.title)
    button.focus()
    fireEvent.click(button)
    expect(document.activeElement).toBe(button)

    rerender(<List options={{ tasks: [PARENT], totals: { [PARENT.id]: 0 } }} />)

    expect(document.activeElement).not.toBe(document.body)
    expect(document.activeElement?.closest('[data-dart-row-id]')).toBeTruthy()
  })

  it('expands on Right, collapses on Left, and opens on Enter; Right does nothing on a leaf', () => {
    const onOpenTask = vi.fn()
    render(<List options={{ tasks: HIERARCHY }} onOpenTask={onOpenTask} />)
    const parentRow = screen.getByText(PARENT.title).closest<HTMLElement>('[role="button"]')!

    fireEvent.keyDown(parentRow, { key: 'ArrowRight' })
    expect(screen.getByText(FIRST.title)).toBeTruthy()
    fireEvent.keyDown(parentRow, { key: 'ArrowLeft' })
    expect(screen.queryByText(FIRST.title)).toBeNull()

    fireEvent.keyDown(parentRow, { key: 'Enter' })
    expect(onOpenTask).toHaveBeenCalledWith(PARENT)

    fireEvent.keyDown(parentRow, { key: 'ArrowRight' })
    const leafRow = screen.getByText(SECOND.title).closest<HTMLElement>('[role="button"]')!
    fireEvent.keyDown(leafRow, { key: 'ArrowRight' })
    expect(screen.getByText(SECOND.title)).toBeTruthy()
    expect(screen.getAllByRole('group')).toHaveLength(1)
  })

  it('renders exactly as a flat list when no nested model is given', () => {
    render(<List options={{ tasks: HIERARCHY }} flat />)
    expect(screen.queryByRole('button', { name: /subtasks of/ })).toBeNull()
    expect(screen.queryByText(/loaded|done$/)).toBeNull()
    expect(screen.getByText(FIRST.title)).toBeTruthy()
  })

  it('shows blocker markers on rows, and "Blockers not checked" only for on-hold rows', async () => {
    render(<List options={{ tasks: HIERARCHY }} />)
    await userEvent.click(expandButton(PARENT.title))
    expect(screen.getByRole('img', { name: 'Blocked by 2' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Blocking 1' })).toBeTruthy()
    expect(screen.getAllByText('Blockers not checked').length).toBeGreaterThan(0)
  })
})
