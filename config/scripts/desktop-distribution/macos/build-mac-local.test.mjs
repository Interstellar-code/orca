import { describe, expect, it } from 'vitest'
import { createLocalBuildVersion, forkBaseVersion } from './build-mac-local.mjs'

describe('forkBaseVersion', () => {
  it('labels the build with the upstream release the fork contains', () => {
    expect(forkBaseVersion('1.4.214', '1.4.247\n')).toBe('1.4.247-fork')
    expect(createLocalBuildVersion(forkBaseVersion('1.4.214', '1.4.247'), 1, 'abc')).toBe(
      '1.4.247-fork.local.1.abc'
    )
  })

  it('keeps the package version when no upstream release is recorded', () => {
    expect(forkBaseVersion('1.4.214', undefined)).toBe('1.4.214')
    expect(forkBaseVersion('1.4.214', '  ')).toBe('1.4.214')
  })

  it('rejects a recorded value that is not a plain release', () => {
    expect(() => forkBaseVersion('1.4.214', 'v1.4.247')).toThrow(/not a release version/)
  })
})
