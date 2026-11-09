// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import {
  dartTaskFixture,
  installFakeDartRuntime
} from '@/store/slices/dart/dart-fake-runtime.test-support'
import { useDartAttachmentUrlSource } from './use-dart-attachment-url-source'

const taskId = 'aB3dE5gH7jK9'
const taskUrl = `https://app.dartai.com/t/${taskId}-search-results`
const realWindow = window
const initialSettings = useAppStore.getState().settings

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  useAppStore.setState({ settings: initialSettings })
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useDartAttachmentUrlSource', () => {
  it('reads a pasted link on the host it was pasted on when the page switches hosts before the debounce fires', async () => {
    const runtime = installFakeDartRuntime()
    // The fake stubs a bare `window`, which React DOM cannot render into, so its API moves onto the real one.
    const api = window.api
    vi.stubGlobal('window', realWindow)
    Object.assign(realWindow, { api })
    const hostA = runtime.host('attach-a')
    const hostB = runtime.host('attach-b')
    hostA.addTask(dartTaskFixture(taskId))
    const settings = useAppStore.getState().settings!
    useAppStore.setState({ settings: { ...settings, activeRuntimeEnvironmentId: 'attach-a' } })

    renderHook(() => useDartAttachmentUrlSource({ value: taskUrl, sourceContext: null }))
    act(() => {
      useAppStore.setState({ settings: { ...settings, activeRuntimeEnvironmentId: 'attach-b' } })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    expect(hostA.count('dart.getTask')).toBe(1)
    expect(hostB.requests).toEqual([])
  })
})
