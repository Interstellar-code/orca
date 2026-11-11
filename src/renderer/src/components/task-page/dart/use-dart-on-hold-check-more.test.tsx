// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useDartOnHoldCheckMore } from './use-dart-on-hold-check-more'

function ids(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `held${String(index).padStart(2, '0')}`)
}

function mountCheckMore(unchecked: string[], errored: string[], publication = 'scope:1') {
  const read = vi.fn<(taskIds: string[]) => Promise<void>>(() => Promise.resolve())
  const erroredSet = new Set(errored)
  const hook = renderHook(() =>
    useDartOnHoldCheckMore({ unchecked, errored: erroredSet, publication, read })
  )
  return { read, checkMore: () => hook.result.current?.() }
}

describe('useDartOnHoldCheckMore', () => {
  it('cycles through 45 failing tasks before repeating any', () => {
    const all = ids(45)
    const { read, checkMore } = mountCheckMore(all, all)

    checkMore()
    checkMore()
    checkMore()

    const [first, second, third] = read.mock.calls.map(([batch]) => batch)
    expect(first).toEqual(all.slice(0, 20))
    expect(second).toEqual(all.slice(20, 40))
    expect(new Set([...first, ...second, ...third])).toEqual(new Set(all))
    // Fresh ids come before retries, and retries are the least recently attempted.
    expect(third).toEqual([...all.slice(40), ...all.slice(0, 15)])
  })

  it('reads untried tasks before retrying ones that already failed', () => {
    const all = ids(25)
    const { read, checkMore } = mountCheckMore(all, ids(3))

    checkMore()

    expect(read).toHaveBeenCalledWith(all.slice(3, 23))
  })

  it('starts over for a new publication', () => {
    const all = ids(30)
    const read = vi.fn<(taskIds: string[]) => Promise<void>>(() => Promise.resolve())
    const errored = new Set(all)
    const hook = renderHook(
      (props: { publication: string }) =>
        useDartOnHoldCheckMore({ unchecked: all, errored, publication: props.publication, read }),
      { initialProps: { publication: 'scope:1' } }
    )
    hook.result.current?.()

    hook.rerender({ publication: 'scope:2' })
    hook.result.current?.()

    expect(read).toHaveBeenNthCalledWith(2, all.slice(0, 20))
  })
})
