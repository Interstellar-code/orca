import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION,
  RUNTIME_PROTOCOL_VERSION
} from '../../../shared/protocol-version'
import type { RuntimeStatus } from '../../../shared/runtime-types'
import {
  clearRecentRuntimeCompatibilityFailure,
  clearRuntimeCompatibilityCache,
  compatibilityEntry,
  getCachedRuntimeCompatibilityCheck,
  markRuntimeEnvironmentCompatible,
  rememberRuntimeEnvironmentCompatibility,
  runtimeCompatibilityGeneration
} from './runtime-compatibility-cache'

const status: RuntimeStatus = {
  runtimeId: 'runtime-a',
  graphStatus: 'ready',
  runtimeProtocolVersion: RUNTIME_PROTOCOL_VERSION,
  minCompatibleRuntimeClientVersion: MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION,
  rendererGraphEpoch: 0,
  authoritativeWindowId: null,
  liveTabCount: 0,
  liveLeafCount: 0
}

describe('runtime compatibility generation', () => {
  beforeEach(() => {
    clearRuntimeCompatibilityCache()
  })

  it.each([
    [
      'a live status observation on an empty cache',
      () => clearRecentRuntimeCompatibilityFailure('env', status)
    ],
    ['clearing one environment that has no entry', () => clearRuntimeCompatibilityCache('env')],
    ['marking an environment compatible', () => markRuntimeEnvironmentCompatible('env', status)],
    [
      'remembering an entry',
      () => rememberRuntimeEnvironmentCompatibility('env', compatibilityEntry())
    ]
  ])('moves on %s', (_name, change) => {
    const before = runtimeCompatibilityGeneration('env')
    change()
    expect(runtimeCompatibilityGeneration('env')).not.toBe(before)
  })

  it('moves for every environment when the whole cache is cleared', () => {
    const before = runtimeCompatibilityGeneration('env')
    clearRuntimeCompatibilityCache()
    expect(runtimeCompatibilityGeneration('env')).not.toBe(before)
  })

  it('moves when an expired failed entry is dropped', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(0))
      rememberRuntimeEnvironmentCompatibility('env', { ...compatibilityEntry(), failedAt: 0 })
      const before = runtimeCompatibilityGeneration('env')
      vi.setSystemTime(new Date(60_000))
      expect(getCachedRuntimeCompatibilityCheck('env', {})).toBeNull()
      expect(runtimeCompatibilityGeneration('env')).not.toBe(before)
    } finally {
      vi.useRealTimers()
    }
  })
})
