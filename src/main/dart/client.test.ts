import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FIXTURE_TOKEN,
  FIXTURE_USER,
  installDartHost,
  jsonResponse,
  routeSignedIn,
  type DartHost
} from './dart-host-fixture'

vi.mock('../network/proxy-settings', () => ({
  ensureElectronProxyFromEnvironment: vi.fn().mockResolvedValue(undefined)
}))

let host: DartHost | null = null

async function load(options?: Parameters<typeof installDartHost>[0]) {
  vi.resetModules()
  host = await installDartHost(options)
  return { host, client: await import('./client') }
}

function tokenFile(home: string): string {
  return join(home, '.orca', 'dart-api-key.enc')
}

afterEach(() => {
  host?.restore()
  host = null
  vi.restoreAllMocks()
})

describe('dart token store', () => {
  it('seals the token at rest and reports it as sealed', async () => {
    const { host, client } = await load()
    routeSignedIn(host)

    await expect(client.connect({ apiToken: ` ${FIXTURE_TOKEN} ` })).resolves.toEqual({
      ok: true,
      viewer: FIXTURE_USER
    })

    const stored = readFileSync(tokenFile(host.home), 'utf8')
    expect(stored.startsWith('orca-dart-api-key:v1:encrypted:')).toBe(true)
    expect(stored).not.toContain(FIXTURE_TOKEN)
    await expect(client.getStatus()).resolves.toMatchObject({
      ok: true,
      connected: true,
      viewer: FIXTURE_USER,
      credentialProtection: 'sealed'
    })
  })

  it('flags a plaintext token when encryption is unavailable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { host, client } = await load({ encryption: false })
    routeSignedIn(host)

    await client.connect({ apiToken: FIXTURE_TOKEN })

    await expect(client.getStatus()).resolves.toMatchObject({ credentialProtection: 'plaintext' })
  })

  it('reports an undecryptable token as a credential error, not a crash', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { host, client } = await load()
    mkdirSync(join(host.home, '.orca'), { recursive: true })
    writeFileSync(tokenFile(host.home), 'not-an-envelope')

    const status = await client.getStatus()

    expect(status).toMatchObject({ ok: true, connected: true, viewer: null })
    expect(status.ok && status.credentialError).toBeTruthy()
    await expect(client.testConnection()).resolves.toMatchObject({ errorCode: 'dart.notConnected' })
    expect(host.fetch).not.toHaveBeenCalled()
  })

  it('maps a store that cannot seal (orcad key not loaded) to dart.connectFailed', async () => {
    const { host, client } = await load({ sealThrows: true })
    routeSignedIn(host)

    await expect(client.connect({ apiToken: FIXTURE_TOKEN })).resolves.toMatchObject({
      ok: false,
      errorCode: 'dart.connectFailed'
    })
    await expect(client.getStatus()).resolves.toMatchObject({ connected: false })
  })
})

describe('dart connection', () => {
  it('rejects a bad token with dart.unauthorized and stores nothing', async () => {
    const { host, client } = await load()
    host.route('GET', '/me', () => jsonResponse(401, { detail: 'Invalid token.' }))

    const result = await client.connect({ apiToken: FIXTURE_TOKEN })

    expect(result).toMatchObject({ ok: false, errorCode: 'dart.unauthorized' })
    expect(result.ok ? '' : result.error).toContain('HTTP 401')
    expect(result.ok ? '' : result.error).toContain('Invalid token.')
    await expect(client.getStatus()).resolves.toMatchObject({ connected: false })
  })

  it('keeps the token out of a failed /me error, its logs and the sent request URL', async () => {
    const logged: unknown[] = []
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, level).mockImplementation((...args) => void logged.push(...args))
    }
    const { host, client } = await load()
    host.route('GET', '/me', () => jsonResponse(500, { detail: 'boom' }))

    const result = await client.connect({ apiToken: FIXTURE_TOKEN })

    expect(result).toEqual({
      ok: false,
      errorCode: 'dart.connectFailed',
      error: 'Dart request failed (HTTP 500): boom'
    })
    const [url, init] = host.fetch.mock.calls[0]
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${FIXTURE_TOKEN}`)
    expect(url).not.toContain(FIXTURE_TOKEN)
    expect(JSON.stringify(result)).not.toContain(FIXTURE_TOKEN)
    expect(JSON.stringify(result).toLowerCase()).not.toContain('authorization')
    expect(logged.map(String).join('\n')).not.toContain(FIXTURE_TOKEN)
  })

  it('disconnect clears the token and the cached identity', async () => {
    const { host, client } = await load()
    routeSignedIn(host)
    await client.connect({ apiToken: FIXTURE_TOKEN })

    expect(client.disconnect()).toEqual({ ok: true })

    await expect(client.getStatus()).resolves.toMatchObject({ connected: false, viewer: null })
    await expect(client.getConfig()).resolves.toMatchObject({ errorCode: 'dart.notConnected' })
  })

  it('re-reads the viewer from /me once after a restart', async () => {
    const first = await load()
    routeSignedIn(first.host)
    await first.client.connect({ apiToken: FIXTURE_TOKEN })
    const home = first.host.home
    vi.resetModules()
    process.env.HOME = home
    const { setMainHttpClient } = await import('../network/http-client')
    setMainHttpClient({ fetch: first.host.fetch, proxySession: () => null })
    const client = await import('./client')
    first.host.fetch.mockClear()

    await expect(client.getStatus()).resolves.toMatchObject({ viewer: FIXTURE_USER })
    await client.getStatus()

    expect(first.host.fetch).toHaveBeenCalledTimes(1)
  })

  it('caches /config and drops it after a 401 so the next read refetches', async () => {
    const { host, client } = await load()
    routeSignedIn(host, {
      dartboards: ['General/Active'],
      assignees: [{ name: 'Ada' }],
      tags: ['bug'],
      sizes: '1,2,3'
    })
    await client.connect({ apiToken: FIXTURE_TOKEN })

    await expect(client.getConfig()).resolves.toEqual({
      ok: true,
      config: {
        dartboards: ['General/Active'],
        statuses: [],
        types: [],
        tags: ['bug'],
        priorities: [],
        sizes: ['1', '2', '3'],
        assignees: ['Ada']
      }
    })
    const configReads = () =>
      host.fetch.mock.calls.filter(([url]) => new URL(url).pathname.endsWith('/config')).length
    await client.getConfig()
    expect(configReads()).toBe(1)

    host.route('GET', '/me', () => jsonResponse(401, { detail: 'expired' }))
    await expect(client.testConnection()).resolves.toMatchObject({ errorCode: 'dart.unauthorized' })
    await client.getConfig()
    expect(configReads()).toBe(2)
    await expect(client.getStatus()).resolves.toMatchObject({ connected: true, viewer: null })
  })
})
