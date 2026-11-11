import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ web: false, name: null as string | null }))
vi.mock('@/lib/web-client-location', () => ({ isWebClientLocation: () => state.web }))
vi.mock('@/web/web-runtime-environment', () => ({
  readStoredWebRuntimeEnvironment: () => (state.name === null ? null : { name: state.name })
}))

import { withWebClientLocalHostLabel } from './web-client-local-host-label'

const labels = new Map([
  ['local', 'Local Mac'],
  ['ssh:box', 'box']
])

describe('withWebClientLocalHostLabel', () => {
  beforeEach(() => {
    state.web = false
    state.name = null
  })

  it('keeps the desktop label outside a web client', () => {
    state.name = 'Orca Server'
    expect(withWebClientLocalHostLabel(labels).get('local')).toBe('Local Mac')
  })

  it('names the paired server in a web client', () => {
    state.web = true
    state.name = 'Ubu 7of9'
    const result = withWebClientLocalHostLabel(labels)
    expect(result.get('local')).toBe('Ubu 7of9')
    expect(result.get('ssh:box')).toBe('box')
  })

  it('keeps the label when the pairing has no name', () => {
    state.web = true
    state.name = '  '
    expect(withWebClientLocalHostLabel(labels).get('local')).toBe('Local Mac')
  })
})
