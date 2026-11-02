import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FIXTURE_TOKEN,
  installDartHost,
  jsonResponse,
  type DartHost
} from './dart-host.test-fixture'

vi.mock('../network/proxy-settings', () => ({
  ensureElectronProxyFromEnvironment: vi.fn().mockResolvedValue(undefined)
}))

let host: DartHost | null = null

afterEach(() => {
  vi.useRealTimers()
  host?.restore()
  host = null
})

async function load() {
  vi.resetModules()
  host = await installDartHost()
  return { host, request: await import('./dart-request') }
}

describe('dartRequest', () => {
  it('refuses redirects so the bearer token is never replayed elsewhere', async () => {
    const { host, request } = await load()
    host.route('GET', '/me', () => jsonResponse(200, {}))

    await request.dartRequest(FIXTURE_TOKEN, '/me')

    expect(host.fetch.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error' })
  })

  it('times out after 30 seconds and aborts the hung request', async () => {
    const { host, request } = await load()
    let signal: AbortSignal | undefined
    host.route('GET', '/me', ({ init }) => {
      signal = init?.signal ?? undefined
      return new Promise<Response>((_resolve, reject) =>
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      )
    })
    vi.useFakeTimers()

    const pending = request.dartRequest(FIXTURE_TOKEN, '/me')
    const settled = expect(pending).rejects.toMatchObject({
      kind: 'timeout',
      message: 'Dart did not respond in time.'
    })
    await vi.advanceTimersByTimeAsync(request.DART_REQUEST_TIMEOUT_MS - 1)
    expect(signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)

    await settled
    expect(signal?.aborted).toBe(true)
  })
})
