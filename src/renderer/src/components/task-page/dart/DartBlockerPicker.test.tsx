// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import { DartBlockerPicker } from './DartBlockerPicker'
import type { DartRelationshipsApi } from './dart-board-contracts'
import { fixtureTasks } from './dart-task.mock'

type SearchTasks = DartRelationshipsApi['searchTasks']
type SearchReply = { ok: true; tasks: readonly DartTask[] } | { ok: false; error: string }

const [self, current, candidate, other] = fixtureTasks

function deferred() {
  let resolve!: (reply: SearchReply) => void
  const promise = new Promise<SearchReply>((done) => (resolve = done))
  return { promise, resolve }
}

function setup(
  searchTasks: Mock<SearchTasks> = vi.fn<SearchTasks>().mockResolvedValue({
    ok: true,
    tasks: [candidate]
  }),
  dartboardOnlyUnavailable?: boolean
) {
  const onPick = vi.fn()
  render(
    <DartBlockerPicker
      taskId={self.id}
      excludeIds={[current.id]}
      searchTasks={searchTasks}
      onPick={onPick}
      dartboardOnlyUnavailable={dartboardOnlyUnavailable}
    />
  )
  const trigger = screen.getByRole('button', { name: /add blocker/i })
  fireEvent.click(trigger)
  return { searchTasks, onPick, trigger }
}

const input = (): HTMLElement => screen.getByRole('combobox')
const type = (value: string): void => {
  fireEvent.change(input(), { target: { value } })
}
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

beforeEach(() => {
  vi.useFakeTimers()
  HTMLElement.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('DartBlockerPicker search', () => {
  it('waits 300 ms after the last keystroke and sends one search with no dartboard filter', async () => {
    const { searchTasks } = setup()
    expect(screen.getByText('Type to search tasks')).toBeTruthy()

    type('s')
    await advance(200)
    type('se')
    await advance(200)
    type('sea')
    await advance(299)
    expect(searchTasks).not.toHaveBeenCalled()
    await advance(1)

    expect(searchTasks).toHaveBeenCalledExactlyOnceWith('sea', { thisDartboardOnly: false })
    expect(screen.getByText(candidate.title)).toBeTruthy()
  })

  it('shows the spinner only after a request has been in flight for 200 ms', async () => {
    const pending = deferred()
    setup(vi.fn().mockReturnValue(pending.promise))
    type('sea')
    await advance(300)

    await advance(199)
    expect(screen.queryByRole('status', { name: 'Searching' })).toBeNull()
    await advance(1)
    expect(screen.getByRole('status', { name: 'Searching' })).toBeTruthy()

    pending.resolve({ ok: true, tasks: [candidate] })
    await advance(0)
    expect(screen.queryByRole('status', { name: 'Searching' })).toBeNull()
  })

  it('says so when nothing matches, and never offers the task itself or a current blocker', async () => {
    const { searchTasks } = setup(
      vi.fn().mockResolvedValueOnce({ ok: true, tasks: [self, current, candidate] })
    )
    type('sea')
    await advance(300)
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      expect.stringContaining(candidate.title)
    ])

    searchTasks.mockResolvedValueOnce({ ok: true, tasks: [self, current] })
    type('seax')
    await advance(300)
    expect(screen.getByText('No matching tasks')).toBeTruthy()
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('makes the previous results unselectable as soon as the text changes, before the debounce fires', async () => {
    const searchTasks = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, tasks: [candidate] })
      .mockResolvedValueOnce({ ok: true, tasks: [other] })
    const { onPick } = setup(searchTasks)
    type('abc')
    await advance(300)
    expect(screen.getByText(candidate.title)).toBeTruthy()

    type('abcd')
    expect(screen.queryByText(candidate.title)).toBeNull()
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(onPick).not.toHaveBeenCalled()

    await advance(300)
    expect(screen.getByText(other.title)).toBeTruthy()
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(onPick).toHaveBeenCalledExactlyOnceWith(other)
  })

  it.each([
    [
      'a failed reply',
      (): Mock<SearchTasks> =>
        vi.fn<SearchTasks>().mockResolvedValue({ ok: false, error: 'Dart is down' })
    ],
    [
      'a thrown error',
      (): Mock<SearchTasks> => vi.fn<SearchTasks>().mockRejectedValue(new Error('Dart is down'))
    ]
  ])('shows %s with Retry that repeats the same query', async (_label, makeSearch) => {
    const searchTasks = makeSearch()
    setup(searchTasks)
    type('sea')
    await advance(300)
    expect(screen.getByRole('alert').textContent).toContain('Dart is down')

    searchTasks.mockResolvedValue({ ok: true, tasks: [candidate] })
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await advance(0)

    expect(searchTasks).toHaveBeenCalledTimes(2)
    expect(searchTasks).toHaveBeenLastCalledWith('sea', { thisDartboardOnly: false })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText(candidate.title)).toBeTruthy()
  })
})

describe('DartBlockerPicker This dartboard only', () => {
  it('searches at once with thisDartboardOnly true and drops the old mode reply still in flight', async () => {
    const oldMode = deferred()
    const searchTasks = vi
      .fn()
      .mockReturnValueOnce(oldMode.promise)
      .mockResolvedValueOnce({ ok: true, tasks: [other] })
    setup(searchTasks)
    type('sea')
    await advance(300)
    expect(searchTasks).toHaveBeenLastCalledWith('sea', { thisDartboardOnly: false })

    fireEvent.click(screen.getByRole('switch', { name: 'This dartboard only' }))
    await advance(0)
    expect(searchTasks).toHaveBeenCalledTimes(2)
    expect(searchTasks).toHaveBeenLastCalledWith('sea', { thisDartboardOnly: true })

    oldMode.resolve({ ok: true, tasks: [candidate] })
    await advance(0)
    expect(screen.queryByText(candidate.title)).toBeNull()
    expect(screen.getByText(other.title)).toBeTruthy()
  })

  it('clears the old mode results while the new mode search is running', async () => {
    const newMode = deferred()
    setup(
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, tasks: [candidate] })
        .mockReturnValueOnce(newMode.promise)
    )
    type('sea')
    await advance(300)
    expect(screen.getByText(candidate.title)).toBeTruthy()

    fireEvent.click(screen.getByRole('switch', { name: 'This dartboard only' }))
    expect(screen.queryByText(candidate.title)).toBeNull()
  })

  it('disables the toggle with a reason when the task has no dartboard, and never filters by dartboard', async () => {
    const { searchTasks } = setup(undefined, true)
    const toggle = screen.getByRole('switch', { name: 'This dartboard only' })
    expect(toggle.hasAttribute('disabled')).toBe(true)
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText('This task has no dartboard.')).toBeTruthy()

    type('sea')
    await advance(300)
    expect(searchTasks).toHaveBeenCalledExactlyOnceWith('sea', { thisDartboardOnly: false })
  })

  it('turns the mode off and searches again without it when the dartboard becomes unavailable', async () => {
    const searchTasks = vi.fn<SearchTasks>().mockResolvedValue({ ok: true, tasks: [candidate] })
    const props = { taskId: self.id, excludeIds: [], searchTasks, onPick: vi.fn() }
    const { rerender } = render(<DartBlockerPicker {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /add blocker/i }))
    type('sea')
    fireEvent.click(screen.getByRole('switch', { name: 'This dartboard only' }))
    await advance(0)
    expect(searchTasks).toHaveBeenLastCalledWith('sea', { thisDartboardOnly: true })

    rerender(<DartBlockerPicker {...props} dartboardOnlyUnavailable />)
    await advance(0)
    expect(searchTasks).toHaveBeenLastCalledWith('sea', { thisDartboardOnly: false })
    expect(
      screen.getByRole('switch', { name: 'This dartboard only' }).getAttribute('aria-checked')
    ).toBe('false')
  })
})

describe('DartBlockerPicker keyboard', () => {
  it('moves the active item with the arrows and picks it once with Enter', async () => {
    const { onPick } = setup(vi.fn().mockResolvedValue({ ok: true, tasks: [candidate, other] }))
    type('sea')
    await advance(300)
    const active = (): string | undefined =>
      screen.getAllByRole('option').find((o) => o.getAttribute('aria-selected') === 'true')
        ?.textContent ?? undefined

    expect(active()).toContain(candidate.title)
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    expect(active()).toContain(other.title)
    fireEvent.keyDown(input(), { key: 'ArrowUp' })
    expect(active()).toContain(candidate.title)
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    fireEvent.keyDown(input(), { key: 'Enter' })

    expect(onPick).toHaveBeenCalledExactlyOnceWith(other)
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('closes on Escape and returns focus to the Add blocker button', async () => {
    const { trigger } = setup()
    input().focus()

    fireEvent.keyDown(input(), { key: 'Escape' })
    await advance(0)

    expect(screen.queryByRole('combobox')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})
