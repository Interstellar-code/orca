// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import type { DartBoardFilters, DartSavedView } from '../../../../../shared/dart/dart-saved-views'
import {
  installFakeDartRuntime,
  type FakeDartHost
} from '@/store/slices/dart/dart-fake-runtime.test-support'
import { useTaskPageDartSavedViews } from './use-task-page-dart-saved-views'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const NO_FILTERS: DartBoardFilters = {
  mine: false,
  status: null,
  dartboard: null,
  search: '',
  tag: null,
  priority: null,
  onHold: false
}
const realWindow = window
let runtime: ReturnType<typeof installFakeDartRuntime>
let nextEnv = 0

function view(id: string, name: string, overrides: Partial<DartSavedView> = {}): DartSavedView {
  return { id, name, filters: NO_FILTERS, layout: 'list', showEmptyColumns: false, ...overrides }
}

function freshHost(views: DartSavedView[], activeViewId: string | null = null) {
  const env = `env-${nextEnv++}`
  const host = runtime.host(env)
  host.savedViewState = { views, activeViewId }
  return { env, host }
}

type HookArgs = Parameters<typeof useTaskPageDartSavedViews>[0]

function mount(env: string, current: HookArgs['current'] = baseCurrent()) {
  const applyView = vi.fn<HookArgs['applyView']>()
  const hook = renderHook(
    (props: { env: string; current: HookArgs['current']; active?: boolean }) =>
      useTaskPageDartSavedViews({
        active: props.active ?? true,
        target: { kind: 'environment', environmentId: props.env },
        current: props.current,
        applyView
      }),
    { initialProps: { env, current } }
  )
  return { ...hook, applyView }
}

function baseCurrent(): HookArgs['current'] {
  return { filters: NO_FILTERS, layout: 'list', showEmptyColumns: false }
}

async function ready(hook: ReturnType<typeof mount>): Promise<void> {
  await waitFor(() => expect(hook.result.current.load.state).toBe('ready'))
}

function lastSaved(host: FakeDartHost) {
  return host.savedViewState
}

beforeEach(() => {
  vi.mocked(toast.error).mockClear()
  runtime = installFakeDartRuntime()
  // The fake stubs a bare `window`, which React DOM cannot render into, so its API moves onto the real one.
  const api = window.api
  vi.stubGlobal('window', realWindow)
  Object.assign(realWindow, { api })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('useTaskPageDartSavedViews', () => {
  it('applies the host-selected view on load and a picked view through the select mutation', async () => {
    const board = view('b', 'Board', {
      layout: 'board',
      showEmptyColumns: true,
      filters: { ...NO_FILTERS, mine: true, tag: 'bug' }
    })
    const { env, host } = freshHost([view('a', 'Active'), board], 'a')
    const hook = mount(env)
    await ready(hook)
    expect(hook.applyView).toHaveBeenCalledWith(view('a', 'Active'))

    let applied = false
    await act(async () => {
      applied = await hook.result.current.apply('b')
    })
    expect(applied).toBe(true)
    expect(lastSaved(host).activeViewId).toBe('b')
    expect(hook.applyView).toHaveBeenLastCalledWith(board)
    expect(hook.result.current.activeViewId).toBe('b')

    await act(async () => {
      await hook.result.current.apply(null)
    })
    expect(hook.applyView).toHaveBeenLastCalledWith(null)
    expect(lastSaved(host).activeViewId).toBeNull()
  })

  it('shows the active view as modified when filters, layout or empty columns differ', async () => {
    const { env } = freshHost([view('a', 'Active')], 'a')
    const hook = mount(env)
    await ready(hook)
    expect(hook.result.current.modified).toBe(false)

    hook.rerender({ env, current: { ...baseCurrent(), filters: { ...NO_FILTERS, mine: true } } })
    expect(hook.result.current.modified).toBe(true)
    hook.rerender({ env, current: { ...baseCurrent(), layout: 'board' } })
    expect(hook.result.current.modified).toBe(true)
    hook.rerender({ env, current: { ...baseCurrent(), showEmptyColumns: true } })
    expect(hook.result.current.modified).toBe(true)
    hook.rerender({ env, current: baseCurrent() })
    expect(hook.result.current.modified).toBe(false)
  })

  it('overwrites the active view with the current state and keeps its id and name', async () => {
    const { env, host } = freshHost([view('a', 'Active')], 'a')
    const hook = mount(env)
    await ready(hook)
    const current = {
      filters: { ...NO_FILTERS, status: 'Doing', priority: 'High' },
      layout: 'board' as const,
      showEmptyColumns: true
    }
    hook.rerender({ env, current })
    expect(hook.result.current.modified).toBe(true)

    await act(async () => {
      await hook.result.current.saveCurrent()
    })
    expect(lastSaved(host).views).toEqual([view('a', 'Active', current)])
    expect(hook.result.current.modified).toBe(false)
  })

  it('saves the current state under a new name, selects it and leaves the old view alone', async () => {
    const { env, host } = freshHost([view('a', 'Active')], 'a')
    const hook = mount(env)
    await ready(hook)
    const filters = { ...NO_FILTERS, tag: 'bug' }
    hook.rerender({ env, current: { ...baseCurrent(), filters } })

    let saved = false
    await act(async () => {
      saved = await hook.result.current.saveAsNew('  Bugs  ')
    })
    expect(saved).toBe(true)
    const created = lastSaved(host).views.find((item) => item.name === 'Bugs')
    expect(created).toMatchObject({ filters, layout: 'list', showEmptyColumns: false })
    expect(lastSaved(host).views.find((item) => item.id === 'a')?.filters).toEqual(NO_FILTERS)
    expect(hook.result.current.activeViewId).toBe(created?.id)
    expect(hook.result.current.modified).toBe(false)
  })

  it('renames and deletes views, clearing the selection when the active view goes', async () => {
    const { env, host } = freshHost([view('a', 'Active'), view('b', 'Other')], 'a')
    const hook = mount(env)
    await ready(hook)

    await act(async () => {
      await hook.result.current.rename('b', 'Renamed')
    })
    expect(hook.result.current.views.map((item) => item.name)).toEqual(['Active', 'Renamed'])

    await act(async () => {
      await hook.result.current.remove('a')
    })
    expect(lastSaved(host).views.map((item) => item.id)).toEqual(['b'])
    expect(hook.result.current.activeViewId).toBeNull()
  })

  it('returns false and says why when the host refuses a duplicate name', async () => {
    const { env } = freshHost([view('a', 'Active'), view('b', 'Other')], 'a')
    const hook = mount(env)
    await ready(hook)

    let renamed = true
    let saved = true
    await act(async () => {
      renamed = await hook.result.current.rename('b', 'ACTIVE')
      saved = await hook.result.current.saveAsNew('active')
    })
    expect(renamed).toBe(false)
    expect(saved).toBe(false)
    expect(toast.error).toHaveBeenCalledTimes(2)
    expect(hook.result.current.views.map((item) => item.name)).toEqual(['Active', 'Other'])
  })

  it('reports unsupported for a host without the capability and never writes', async () => {
    const { env, host } = freshHost([view('a', 'Active')], 'a')
    host.savedViews = false
    const hook = mount(env)
    await ready(hook)
    expect(hook.result.current.supported).toBe(false)
    expect(hook.result.current.views).toEqual([])

    let applied = true
    await act(async () => {
      applied = await hook.result.current.apply('a')
    })
    expect(applied).toBe(false)
    expect(host.count('ui.mutateDartSavedViews')).toBe(0)
    expect(hook.applyView).not.toHaveBeenCalled()
  })

  it('drops a read that lands after the target changed', async () => {
    const first = freshHost([view('old', 'Old host view')], 'old')
    const second = freshHost([view('new', 'New host view')])
    const release = first.host.hold('ui.getDartSavedViews')
    const hook = mount(first.env)
    await waitFor(() => expect(first.host.count('ui.getDartSavedViews')).toBe(1))

    hook.rerender({ env: second.env, current: baseCurrent() })
    await waitFor(() => expect(hook.result.current.views.map((item) => item.id)).toEqual(['new']))
    await act(async () => {
      release()
    })
    expect(hook.result.current.views.map((item) => item.id)).toEqual(['new'])
    expect(hook.applyView).not.toHaveBeenCalled()
  })

  it('drops a write reply from the host that was left', async () => {
    const first = freshHost([view('a', 'First')])
    const second = freshHost([view('z', 'Second')])
    const hook = mount(first.env)
    await ready(hook)
    const release = first.host.hold('ui.mutateDartSavedViews')

    let pending: Promise<boolean> = Promise.resolve(true)
    act(() => {
      pending = hook.result.current.apply('a')
    })
    await waitFor(() => expect(first.host.count('ui.mutateDartSavedViews')).toBe(1))
    hook.rerender({ env: second.env, current: baseCurrent() })
    await waitFor(() => expect(hook.result.current.views.map((item) => item.id)).toEqual(['z']))
    await act(async () => {
      release()
      expect(await pending).toBe(false)
    })
    expect(hook.result.current.views.map((item) => item.id)).toEqual(['z'])
    expect(hook.applyView).not.toHaveBeenCalled()
  })

  it('stays idle and sends nothing while inactive', async () => {
    const { env, host } = freshHost([view('a', 'Active')], 'a')
    const applyView = vi.fn()
    renderHook(() =>
      useTaskPageDartSavedViews({
        active: false,
        target: { kind: 'environment', environmentId: env },
        current: baseCurrent(),
        applyView
      })
    )
    await act(async () => {})
    expect(host.count('ui.getDartSavedViews')).toBe(0)
    expect(applyView).not.toHaveBeenCalled()
  })
})
