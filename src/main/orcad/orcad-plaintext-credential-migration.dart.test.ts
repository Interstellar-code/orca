import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import type * as NodeOs from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const home = vi.hoisted(() => ({ dir: '' }))

vi.mock('node:os', async () => ({
  ...(await vi.importActual<typeof NodeOs>('node:os')),
  homedir: () => home.dir
}))

import type { SecretStore } from '../../shared/secret-store'
import { _resetSecretStoreForTests, setSecretStore } from '../../shared/secret-store'
import { readDartApiToken, saveDartApiToken } from '../dart/dart-token-store'
import { migratePlaintextCredentials } from './orcad-plaintext-credential-migration'
import { createOrcadSecretStore } from './orcad-secret-store'

const PREFIX = 'orca-dart-api-key:v1:'

describe('headless plaintext migration of the Dart token', () => {
  let root: string
  let store: SecretStore

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'orcad-dart-migration-'))
    home.dir = join(root, 'home')
    mkdirSync(join(home.dir, '.orca'), { recursive: true })
    const keyDir = join(root, 'keys')
    mkdirSync(keyDir)
    const orcadStore = createOrcadSecretStore()
    await orcadStore.prepare({
      keyDir,
      platform: 'linux',
      env: {},
      legacyKeyring: null,
      machineIdentity: () => '0123456789abcdef0123456789abcdef'
    })
    store = orcadStore
    setSecretStore(store)
  })

  afterEach(() => {
    _resetSecretStoreForTests()
    rmSync(root, { recursive: true, force: true })
  })

  it('seals a plaintext Dart token found by the default target list, and it still reads back', () => {
    const tokenPath = join(home.dir, '.orca', 'dart-api-key.enc')
    writeFileSync(
      tokenPath,
      `${PREFIX}plaintext:${Buffer.from('dsa_plain_token').toString('base64')}`
    )
    expect(existsSync(tokenPath)).toBe(true)

    const result = migratePlaintextCredentials(store, undefined, () => {})

    expect(result).toEqual({ sealed: 1, failed: 0 })
    const text = readFileSync(tokenPath, 'utf8')
    expect(text.startsWith(`${PREFIX}encrypted:`)).toBe(true)
    expect(text).not.toContain('dsa_plain_token')
    expect(readDartApiToken()).toBe('dsa_plain_token')
  })

  it('leaves a token the app already sealed untouched', () => {
    saveDartApiToken('dsa_sealed_token')
    const tokenPath = join(home.dir, '.orca', 'dart-api-key.enc')
    const before = readFileSync(tokenPath)

    expect(migratePlaintextCredentials(store, undefined, () => {})).toEqual({
      sealed: 0,
      failed: 0
    })
    expect(readFileSync(tokenPath)).toEqual(before)
  })
})
