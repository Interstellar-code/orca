// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { useAppStore } from '@/store'
import {
  dartTaskFixture,
  installFakeDartRuntime
} from '@/store/slices/dart/dart-fake-runtime.test-support'
import { getDartReadScope } from '@/store/slices/dart/dart-read-coordination'
import { useTaskPageDartState, type TaskPageDartStateInput } from './use-task-page-dart-state'

type PageInput = Omit<TaskPageDartStateInput, 'providerRuntimeContextKey' | 'dartStatus'>

const HOST_A = 'list-scope-host-a'
const HOST_B = 'list-scope-host-b'
const VIEWER_A = { id: 'viewer-of-host-a', name: 'Alex A' }
const VIEWER_B = { id: 'viewer-of-host-b', name: 'Blake B' }

let runtime: ReturnType<typeof installFakeDartRuntime>
const realWindow = window

function useHost(env: string, viewer: typeof VIEWER_A | null): void {
  const settings = { ...useAppStore.getState().settings!, activeRuntimeEnvironmentId: env }
  useAppStore.setState({
    settings,
    dartStatus: { connected: true, viewer },
    dartStatusChecked: true,
    dartStatusContextKey: getDartReadScope(settings).contextKey
  })
}

function listRequests(env: string) {
  return runtime.host(env).requests.filter(({ method }) => method === 'dart.listTasks')
}

function openListModePage() {
  const state = useAppStore.getState()
  const input: PageInput = {
    taskSource: 'dart',
    dartConnected: true,
    dartTaskSourceContext: null,
    linearAttachmentWorkspaces: [],
    listDartTasks: state.listDartTasks,
    fetchDartTask: state.fetchDartTask,
    fetchDartConfig: state.fetchDartConfig
  }
  return renderHook(() =>
    useTaskPageDartState({
      ...input,
      dartStatus: useAppStore((s) => s.dartStatus),
      providerRuntimeContextKey: useAppStore((s) => getProviderRuntimeContextKey(s.settings))
    })
  )
}

describe('useTaskPageDartState list mode across a host switch', () => {
  beforeEach(() => {
    localStorage.clear()
    runtime = installFakeDartRuntime()
    const api = window.api
    vi.stubGlobal('window', realWindow)
    Object.assign(realWindow, { api })
    for (const env of [HOST_A, HOST_B]) {
      runtime.host(env).board = false
      runtime.host(env).addTask(dartTaskFixture(`task-of-${env}`.padEnd(12, 'x')))
    }
    useAppStore.setState({ dartListCache: {}, dartScopeMetaCache: {} })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('never sends the old host viewer id to the new host while its status is unknown', async () => {
    useHost(HOST_A, VIEWER_A)
    const release = runtime.host(HOST_A).hold('dart.listTasks')
    const hook = openListModePage()
    await waitFor(() => expect(listRequests(HOST_A)).toHaveLength(1))

    act(() => {
      const settings = { ...useAppStore.getState().settings!, activeRuntimeEnvironmentId: HOST_B }
      useAppStore.setState({ settings })
    })
    await waitFor(() => expect(hook.result.current.dartBoardPath).toBe(false))
    await act(async () => {
      release()
    })

    expect(listRequests(HOST_A).map(({ params }) => params.assigneeId)).toEqual([VIEWER_A.id])
    expect(listRequests(HOST_B)).toEqual([])
  })

  it('reads the new host with its own viewer id once that status arrives', async () => {
    useHost(HOST_A, VIEWER_A)
    const hook = openListModePage()
    await waitFor(() => expect(hook.result.current.dartTasks).toHaveLength(1))

    act(() => useHost(HOST_B, VIEWER_B))

    await waitFor(() => expect(listRequests(HOST_B)).toHaveLength(1))
    expect(listRequests(HOST_B)[0].params.assigneeId).toBe(VIEWER_B.id)
    expect(listRequests(HOST_A).map(({ params }) => params.assigneeId)).toEqual([VIEWER_A.id])
  })

  it('keeps a scoped list read on its own host after the active host changes', async () => {
    useHost(HOST_A, VIEWER_A)
    const scopeA = getDartReadScope(useAppStore.getState().settings)
    useHost(HOST_B, VIEWER_B)

    const result = await useAppStore.getState().listDartTasks({ limit: 100 }, { scope: scopeA })

    expect(result.ok).toBe(true)
    expect(listRequests(HOST_A)).toHaveLength(1)
    expect(listRequests(HOST_B)).toEqual([])
  })

  it('lists nothing instead of everyone while the viewer id is missing', async () => {
    useHost(HOST_A, null)
    const hook = openListModePage()
    await waitFor(() => expect(runtime.host(HOST_A).count('dart.config')).toBeGreaterThan(0))

    expect(listRequests(HOST_A)).toEqual([])
    expect(hook.result.current.dartTasks).toEqual([])
  })
})
