import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FIXTURE_TOKEN,
  installDartHost,
  jsonResponse,
  routeSignedIn,
  type DartHost
} from './dart-host.test-fixture'

vi.mock('../network/proxy-settings', () => ({
  ensureElectronProxyFromEnvironment: vi.fn().mockResolvedValue(undefined)
}))

let host: DartHost | null = null
afterEach(() => {
  host?.restore()
  host = null
})

describe('Dart comment pages', () => {
  it.each([
    null,
    {},
    { count: 0 },
    { count: 0, results: null },
    { count: -1, results: [] },
    { count: 0.5, results: [] },
    { count: '1', results: [] },
    { results: [] }
  ])('fails a malformed successful response: %j', async (body) => {
    // Resetting the module registry isolates the token store and network fixture.
    vi.resetModules()
    host = await installDartHost()
    routeSignedIn(host, {})
    const client = await import('./client')
    await client.connect({ apiToken: FIXTURE_TOKEN })
    host.route('GET', '/comments/list', () => jsonResponse(200, body))
    const { listComments } = await import('./dart-tasks')
    await expect(listComments({ taskId: 'abcDEF123456' })).resolves.toMatchObject({
      ok: false,
      errorCode: 'dart.loadFailed'
    })
  })

  it('reports the number of raw rows even when a row cannot be mapped', async () => {
    vi.resetModules()
    // The host fixture and client must bind to the same reset module registry.
    host = await installDartHost()
    routeSignedIn(host, {})
    const client = await import('./client')
    await client.connect({ apiToken: FIXTURE_TOKEN })
    host.route('GET', '/comments/list', () =>
      jsonResponse(200, {
        count: 251,
        results: [{ bad: true }, { id: 'valid', taskId: 'abcDEF123456' }]
      })
    )
    const { listComments } = await import('./dart-tasks')
    await expect(listComments({ taskId: 'abcDEF123456' })).resolves.toMatchObject({
      ok: true,
      totalCount: 251,
      rawCount: 2,
      comments: [{ id: 'valid' }]
    })
  })
})
