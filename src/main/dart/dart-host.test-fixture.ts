import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vi } from 'vitest'

export const FIXTURE_TOKEN = 'dsa_fixture-token-0123456789'
export const FIXTURE_USER = { id: 'usr000000001', name: 'Ada', email: 'ada@example.com' }

export type DartRoute = (request: {
  url: URL
  init: RequestInit | undefined
}) => Response | Promise<Response>

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

/** Temp HOME, an in-memory secret store and a routed fetch; restore() undoes all three.
 * Imports its globals lazily so they bind to the module registry left by `vi.resetModules()`. */
export async function installDartHost(
  options: { encryption?: boolean; sealThrows?: boolean } = {}
) {
  const { setSecretStore } = await import('../../shared/secret-store')
  const { setMainHttpClient } = await import('../network/http-client')
  const home = mkdtempSync(join(tmpdir(), 'orca-dart-'))
  const previousHome = process.env.HOME
  const previousProfile = process.env.USERPROFILE
  process.env.HOME = home
  process.env.USERPROFILE = home
  setSecretStore({
    isEncryptionAvailable: () => options.encryption ?? true,
    encryptString: (value: string) => {
      if (options.sealThrows) {
        throw new Error('orcad_secret_store_not_prepared')
      }
      return Buffer.from(`sealed:${value}`)
    },
    decryptString: (value: Buffer) => value.toString('utf8').replace(/^sealed:/, ''),
    describeProtectionGap: () => null
  })
  const routes = new Map<string, DartRoute>()
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const parsed = new URL(url)
    const route = routes.get(`${init?.method ?? 'GET'} ${parsed.pathname}`)
    if (!route) {
      throw new TypeError(`no fixture route for ${parsed.pathname}`)
    }
    return route({ url: parsed, init })
  })
  setMainHttpClient({ fetch, proxySession: () => null })
  return {
    home,
    fetch,
    route(method: string, path: string, handler: DartRoute) {
      routes.set(`${method} /api/v0/public${path}`, handler)
    },
    lastBody(): unknown {
      const init = fetch.mock.calls.at(-1)?.[1]
      return typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    },
    restore() {
      setMainHttpClient(null)
      process.env.HOME = previousHome
      process.env.USERPROFILE = previousProfile
      rmSync(home, { recursive: true, force: true })
    }
  }
}

export type DartHost = Awaited<ReturnType<typeof installDartHost>>

export function routeSignedIn(host: DartHost, config: unknown = {}): void {
  host.route('GET', '/me', () => jsonResponse(200, { isLoggedIn: true, user: FIXTURE_USER }))
  host.route('GET', '/config', () => jsonResponse(200, config))
}
