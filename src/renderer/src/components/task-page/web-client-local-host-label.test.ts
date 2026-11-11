import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildExecutionHostRegistry } from '../../../../shared/execution-host-registry'

const state = vi.hoisted(() => ({ web: false, name: null as string | null, throws: false }))
vi.mock('@/lib/web-client-location', () => ({ isWebClientLocation: () => state.web }))
vi.mock('@/web/web-runtime-environment', () => ({
  readStoredWebRuntimeEnvironment: () => {
    if (state.throws) {
      throw new Error('storage blocked')
    }
    return state.name === null ? null : { name: state.name }
  }
}))

import { getWebClientLocalHostLabel } from './web-client-local-host-label'

function localLabel(overrides?: ReadonlyMap<'local', string>): string | undefined {
  return buildExecutionHostRegistry({
    repos: [],
    settings: null,
    hostLabelOverrides: overrides,
    localHostLabel: getWebClientLocalHostLabel()
  }).find((host) => host.id === 'local')?.label
}

describe('getWebClientLocalHostLabel', () => {
  beforeEach(() => {
    state.web = false
    state.name = null
    state.throws = false
  })

  it('leaves the desktop label alone outside a web client', () => {
    state.name = 'Orca Server'
    expect(getWebClientLocalHostLabel()).toBeUndefined()
  })

  it('names the paired server in a web client', () => {
    state.web = true
    state.name = 'Ubu 7of9'
    expect(localLabel()).toBe('Ubu 7of9')
  })

  it('lets a user-set host label win over the pairing name', () => {
    state.web = true
    state.name = 'Orca Server'
    expect(localLabel(new Map([['local', 'Build box']]))).toBe('Build box')
  })

  it('falls back when the pairing has no name or storage throws', () => {
    state.web = true
    state.name = '  '
    expect(getWebClientLocalHostLabel()).toBeUndefined()
    state.name = 'Orca Server'
    state.throws = true
    expect(getWebClientLocalHostLabel()).toBeUndefined()
  })
})
