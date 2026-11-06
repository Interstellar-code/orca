// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../../shared/constants'
import type { DartWorkspaceConfig } from '../../../../../shared/dart/dart-types'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { useAppStore } from '@/store'
import { installFakeDartRuntime } from '@/store/slices/dart/dart-fake-runtime.test-support'
import { getDartReadScope } from '@/store/slices/dart/dart-read-coordination'
import { unsavedDartCreateTextsForHost } from './dart-create-draft-accounting'
import {
  clearDraft,
  dartDraftKey,
  dirtyDraftCount,
  dirtyDraftTexts,
  discardDirtyDrafts,
  oldestDirtyDraft,
  setDraft
} from './dart-draft-store'
import { useTaskPageDartCreation } from './use-task-page-dart-creation'

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

const viewer = { id: 'user-a', name: 'Alex Example' }
const config: DartWorkspaceConfig = {
  dartboards: ['Example/Platform'],
  statuses: [],
  types: [],
  priorities: [],
  tags: [],
  sizes: [],
  assignees: []
}
const realWindow = window
const LOCAL = { hostKey: 'local', accountKey: viewer.id }

function setup() {
  installFakeDartRuntime()
  const api = window.api
  vi.stubGlobal('window', realWindow)
  Object.assign(realWindow, { api })
  const settings = { ...getDefaultSettings('/home/alex'), activeRuntimeEnvironmentId: null }
  useAppStore.setState({
    settings,
    dartStatus: { connected: true, viewer },
    dartStatusContextKey: getDartReadScope(settings).contextKey,
    dartCreateSessions: {},
    dartCreateOwners: {},
    activeView: 'tasks'
  })
  return renderHook(() => {
    const dartStatus = useAppStore((state) => state.dartStatus)
    const providerRuntimeContextKey = useAppStore((s) => getProviderRuntimeContextKey(s.settings))
    return useTaskPageDartCreation({
      providerRuntimeContextKey,
      taskSource: 'dart',
      dartConnected: true,
      dartUpdateRequired: false,
      dartConfig: config,
      dartFilters: { mine: false, status: null, dartboard: null, search: '' },
      dartStatus,
      setDartRefreshNonce: vi.fn(),
      noteDartTaskCreated: vi.fn(),
      openDartDetailPage: vi.fn()
    })
  })
}

function fillOtherDrafts(count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const key = dartDraftKey(LOCAL, `task-${index}`, 'comment')
    setDraft(key, `comment ${index}`, { dirty: true })
    return key
  })
}

beforeEach(() => {
  discardDirtyDrafts('local')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  discardDirtyDrafts('local')
  useAppStore.setState({ dartCreateSessions: {} })
})

describe('New task draft accounting (D13)', () => {
  it('counts typed text as one unsaved draft of its host until it is cleared', () => {
    const hook = setup()
    act(() => {
      hook.result.current.openCreate()
      hook.result.current.setCreateDraft({ title: 'Ship it', description: 'Soon' })
    })

    expect(dirtyDraftCount('local')).toBe(1)
    expect(dirtyDraftTexts('local')).toEqual(['Ship it\n\nSoon'])

    act(() => hook.result.current.setCreateDraft({ title: '', description: '' }))
    expect(dirtyDraftCount('local')).toBe(0)
  })

  it('does not count a pick with nothing typed', () => {
    const hook = setup()
    act(() => {
      hook.result.current.openCreate()
      hook.result.current.setCreateDraft({ status: 'Doing' })
    })

    expect(dirtyDraftCount('local')).toBe(0)
  })

  it('keeps the text when 20 drafts are already unsaved, warns, and saves it after one is discarded', () => {
    const hook = setup()
    const others = fillOtherDrafts(20)

    act(() => {
      hook.result.current.openCreate()
      hook.result.current.setCreateDraft({ title: 'Twenty-first' })
    })

    expect(hook.result.current.createDraft.title).toBe('Twenty-first')
    expect(hook.result.current.createDraftUnsaved).toBe(true)
    expect(dirtyDraftCount('local')).toBe(20)
    expect(unsavedDartCreateTextsForHost('local')).toEqual(['Twenty-first'])

    const oldest = oldestDirtyDraft()
    expect(oldest?.key).toBe(others[0])
    clearDraft(others[0])
    act(() => hook.result.current.retryCreateDraftSave?.())

    expect(hook.result.current.createDraftUnsaved).toBe(false)
    expect(dirtyDraftCount('local')).toBe(20)
    expect(dirtyDraftTexts('local')).toContain('Twenty-first')
    expect(unsavedDartCreateTextsForHost('local')).toEqual([])
  })
})
