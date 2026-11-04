import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FIXTURE_TOKEN,
  installDartHost,
  jsonResponse,
  type DartHost
} from './dart-host.test-fixture'

const traced = vi.hoisted(() => ({ calls: [] as unknown[][], failed: [] as unknown[] }))
vi.mock('../observability/tracer', () => ({
  withSpan: async (_name: string, fn: (span: unknown) => unknown) => {
    const span = new Proxy(
      {},
      {
        get:
          (_target, method) =>
          (...args: unknown[]) => {
            traced.calls.push([method, ...args])
          }
      }
    )
    try {
      return await fn(span)
    } catch (error) {
      traced.failed.push(error)
      throw error
    }
  }
}))
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

  it('keeps Dart response detail out of the error and trace for update-description only', async () => {
    const { host, request } = await load()
    traced.calls.length = 0
    traced.failed.length = 0
    const body = { errors: ['oldText "SECRET PARAGRAPH" was not found'] }
    host.route('POST', '/tasks/abcDEF123456/update-description', () => jsonResponse(400, body))
    host.route('PUT', '/tasks/abcDEF123456', () => jsonResponse(400, body))

    const patchError = await request
      .dartRequest(FIXTURE_TOKEN, '/tasks/abcDEF123456/update-description', {
        method: 'POST',
        body: {}
      })
      .catch((error: unknown) => error)

    expect(patchError).toMatchObject({ kind: 'http', status: 400 })
    expect(
      JSON.stringify([traced.calls, traced.failed.map(String), String(patchError)])
    ).not.toContain('SECRET')

    const updateError = await request
      .dartRequest(FIXTURE_TOKEN, '/tasks/abcDEF123456', { method: 'PUT', body: {} })
      .catch((error: unknown) => error)
    expect(String(updateError)).toContain('SECRET PARAGRAPH')
  })
})
