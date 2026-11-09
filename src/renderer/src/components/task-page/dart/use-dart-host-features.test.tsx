// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DartHostFeatures } from '../../../../../shared/dart/dart-types'
import type { RuntimeClientTarget } from '../../../../../shared/runtime-client-target'
import { useDartHostFeatures } from './use-dart-host-features'

const probe = vi.hoisted(() => vi.fn())

vi.mock('@/runtime/runtime-dart-client', () => ({ dartBoardFeaturesForTarget: probe }))

const LOCAL: RuntimeClientTarget = { kind: 'local' }

function deferredProbe() {
  let resolve: (features: DartHostFeatures | null) => void = () => {}
  const promise = new Promise<DartHostFeatures | null>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

afterEach(() => {
  cleanup()
  probe.mockReset()
})

describe('useDartHostFeatures', () => {
  it('reports no verdict after a deactivate and reactivate until the new probe answers', async () => {
    probe.mockResolvedValueOnce({ board: true })
    const { result, rerender } = renderHook(
      (props: { active: boolean }) =>
        useDartHostFeatures({ active: props.active, hostKey: 'local', target: LOCAL }),
      { initialProps: { active: true } }
    )
    await waitFor(() => expect(result.current.hostFeatures).toEqual({ board: true }))

    rerender({ active: false })
    const pending = deferredProbe()
    probe.mockReturnValueOnce(pending.promise)
    rerender({ active: true })

    expect(result.current).toEqual({ featuresReady: false, hostFeatures: null })

    await act(async () => {
      pending.resolve({ board: false })
      await pending.promise
    })

    expect(result.current).toEqual({ featuresReady: true, hostFeatures: { board: false } })
  })

  it('drops the verdict when the target changes before the new probe answers', async () => {
    probe.mockResolvedValueOnce({ board: true })
    const { result, rerender } = renderHook(
      (props: { target: RuntimeClientTarget }) =>
        useDartHostFeatures({ active: true, hostKey: 'host', target: props.target }),
      { initialProps: { target: LOCAL } }
    )
    await waitFor(() => expect(result.current.featuresReady).toBe(true))

    probe.mockReturnValueOnce(deferredProbe().promise)
    rerender({ target: { kind: 'environment', environmentId: 'remote' } })

    expect(result.current).toEqual({ featuresReady: false, hostFeatures: null })
  })

  it('counts a bridge that answers nothing as no board', async () => {
    probe.mockResolvedValueOnce(null)
    const { result } = renderHook(() =>
      useDartHostFeatures({ active: true, hostKey: 'local', target: LOCAL })
    )

    await waitFor(() =>
      expect(result.current).toEqual({ featuresReady: true, hostFeatures: { board: false } })
    )
  })
})
