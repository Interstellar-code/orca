// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import {
  dartTaskFixture,
  installFakeDartRuntime
} from '@/store/slices/dart/dart-fake-runtime.test-support'
import { getDartReadScope } from '@/store/slices/dart/dart-read-coordination'
import { dartScopeHostKey } from '@/store/slices/dart/dart-task-identity'
import type { DartCreateSession } from '@/store/slices/task-creation-drafts'
import { submitDartCreate } from './dart-create-submit'

const HOST_A = 'create-scope-host-a'
const HOST_B = 'create-scope-host-b'
const VIEWER = { id: 'user-a', name: 'Alex Example' }
const initialSettings = useAppStore.getState().settings

const session: DartCreateSession = {
  draft: {
    title: 'New task',
    description: '',
    dartboard: 'Board',
    type: '',
    status: '',
    priority: '',
    assignee: '',
    tags: [],
    dueAt: ''
  },
  lookupDraft: null,
  unknown: false,
  submitting: false,
  notice: null,
  listChecked: false,
  matches: [],
  truncated: false,
  matchesDismissed: false,
  lookingUp: false,
  lookupSequence: 0,
  editable: true
}

afterEach(() => {
  useAppStore.setState({ settings: initialSettings })
  vi.unstubAllGlobals()
})

describe('submitDartCreate across a host switch', () => {
  it('creates on the host the form was opened on while the active host is already another', async () => {
    const runtime = installFakeDartRuntime()
    const realWindow = window
    const api = window.api
    vi.stubGlobal('window', realWindow)
    Object.assign(realWindow, { api })
    const hostA = runtime.host(HOST_A)
    const hostB = runtime.host(HOST_B)
    hostA.addTask(dartTaskFixture('existingTask1'))
    const settings = useAppStore.getState().settings!
    const scopeA = getDartReadScope({ activeRuntimeEnvironmentId: HOST_A })
    // The status still describes host A while the setting already names host B.
    useAppStore.setState({
      settings: { ...settings, activeRuntimeEnvironmentId: HOST_B },
      dartStatus: { connected: true, viewer: VIEWER },
      dartStatusChecked: true,
      dartStatusContextKey: scopeA.contextKey,
      dartCreateSessions: { create: session },
      dartCreateOwners: {
        [dartScopeHostKey(scopeA)]: { activeOwner: VIEWER.id, keys: { [VIEWER.id]: 'create' } }
      }
    })

    await submitDartCreate(
      { title: 'New task', dartboard: 'Board' },
      { key: 'create', scope: scopeA, onSuccess: vi.fn() }
    )

    expect(hostA.count('dart.createTask')).toBe(1)
    expect(hostB.requests).toEqual([])
  })
})
