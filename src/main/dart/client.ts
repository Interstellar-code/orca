import type { DartUser, DartWorkspaceConfig } from '../../shared/dart/dart-types'
import type { DartFailure, DartMethodContract } from '../../shared/rpc-contract/dart-params'
import { taskProviderFailure } from '../../shared/task-provider-failure'
import { isDartTokenRejected, toDartFailure } from './dart-failure'
import { DartApiError, dartRequest } from './dart-request'
import { mapDartConfig } from './dart-task-mapping'
import {
  clearDartApiToken,
  getDartApiTokenProtection,
  hasDartApiToken,
  readDartApiToken,
  saveDartApiToken
} from './dart-token-store'

type Reply<M extends keyof DartMethodContract> = DartMethodContract[M]['reply']

// Shared by IPC and runtime RPC so a local connect or disconnect is visible to every transport.
let viewer: DartUser | null = null
let viewerLookup: Promise<DartUser | null> | null = null
let config: DartWorkspaceConfig | null = null
let configLoad: Promise<DartWorkspaceConfig> | null = null
let generation = 0
// Set by a 401 so `dart.status` reports the revoked token instead of a connected, viewer-less state.
let authFailure: DartFailure | null = null

/** Drops cached identity and `/config`; in-flight loads from before the call cannot repopulate them. */
export function invalidate(): void {
  generation += 1
  viewer = null
  viewerLookup = null
  config = null
  configLoad = null
  authFailure = null
}

function notConnected(): DartFailure {
  return taskProviderFailure('dart.notConnected', 'Not connected to Dart.')
}

type TokenRead = { token: string } | { failure: DartFailure }

export function readToken(): TokenRead {
  let token: string | null
  try {
    token = readDartApiToken()
  } catch {
    return {
      failure: taskProviderFailure('dart.notConnected', 'The saved Dart token could not be read.')
    }
  }
  return token ? { token } : { failure: notConnected() }
}

/** Call after a failed request: a 401 means the viewer and `/config` may belong to a revoked token. */
export function noteRequestFailure(error: unknown): void {
  if (isDartTokenRejected(error)) {
    invalidate()
    authFailure = toDartFailure(error, 'connect')
  }
}

async function fetchViewer(token: string): Promise<DartUser> {
  const data = await dartRequest<unknown>(token, '/me')
  const user =
    data && typeof data === 'object' && 'user' in data && data.user && typeof data.user === 'object'
      ? data.user
      : null
  const loggedIn = data && typeof data === 'object' && 'isLoggedIn' in data && data.isLoggedIn
  if (!loggedIn || !user || !('id' in user) || typeof user.id !== 'string' || !user.id) {
    throw new DartApiError('Dart did not return a signed-in user.', 'invalidResponse')
  }
  const name = 'name' in user && typeof user.name === 'string' ? user.name : ''
  const email = 'email' in user && typeof user.email === 'string' ? user.email : null
  return { id: user.id, name, email }
}

async function lookupViewer(token: string): Promise<DartUser | null> {
  if (viewer) {
    return viewer
  }
  const started = generation
  viewerLookup ??= fetchViewer(token)
    .then((user) => {
      if (started === generation) {
        viewer = user
        authFailure = null
      }
      return user
    })
    .catch((error: unknown) => {
      noteRequestFailure(error)
      return null
    })
    .finally(() => {
      if (started === generation) {
        viewerLookup = null
      }
    })
  return viewerLookup
}

export async function getStatus(): Promise<Reply<'dart.status'>> {
  if (!hasDartApiToken()) {
    return { ok: true, connected: false, viewer: null, credentialProtection: null }
  }
  const credentialProtection = getDartApiTokenProtection()
  const token = readToken()
  if ('failure' in token) {
    return {
      ok: true,
      connected: true,
      viewer: null,
      credentialError: token.failure.error,
      credentialProtection
    }
  }
  const current = await lookupViewer(token.token)
  return {
    ok: true,
    connected: true,
    viewer: current,
    ...(!current && authFailure ? { credentialError: authFailure.error } : {}),
    credentialProtection
  }
}

export async function connect(args: { apiToken: string }): Promise<Reply<'dart.connect'>> {
  const apiToken = args.apiToken.trim()
  if (!apiToken) {
    return taskProviderFailure('dart.badRequest', 'API token is required.')
  }
  let user: DartUser
  try {
    user = await fetchViewer(apiToken)
  } catch (error) {
    return toDartFailure(error, 'connect')
  }
  try {
    saveDartApiToken(apiToken)
  } catch {
    // An orcad host without its key loaded throws instead of storing plaintext.
    return taskProviderFailure('dart.connectFailed', 'Could not save the Dart token on this host.')
  }
  invalidate()
  viewer = user
  // Warm the cache; a failed `/config` read is retried by the next caller.
  void loadConfig(apiToken).catch(() => undefined)
  return { ok: true, viewer: user }
}

export function disconnect(): Reply<'dart.disconnect'> {
  invalidate()
  try {
    clearDartApiToken()
  } catch {
    return taskProviderFailure('dart.connectFailed', 'Could not remove the saved Dart token.')
  }
  return { ok: true }
}

export async function testConnection(): Promise<Reply<'dart.testConnection'>> {
  const token = readToken()
  if ('failure' in token) {
    return token.failure
  }
  const started = generation
  try {
    const user = await fetchViewer(token.token)
    if (started === generation) {
      viewer = user
      authFailure = null
    }
    return { ok: true, viewer: user }
  } catch (error) {
    noteRequestFailure(error)
    return toDartFailure(error, 'connect')
  }
}

function loadConfig(token: string): Promise<DartWorkspaceConfig> {
  if (config) {
    return Promise.resolve(config)
  }
  const started = generation
  configLoad ??= dartRequest<unknown>(token, '/config')
    .then((raw) => {
      const loaded = mapDartConfig(raw)
      if (started === generation) {
        config = loaded
      }
      return loaded
    })
    .finally(() => {
      if (started === generation) {
        configLoad = null
      }
    })
  return configLoad
}

/** Cached `/config`; `refresh` re-reads it (used when a name looks unknown). */
export async function readConfig(
  token: string,
  options: { refresh?: boolean } = {}
): Promise<DartWorkspaceConfig> {
  if (options.refresh && !configLoad) {
    config = null
  }
  try {
    return await loadConfig(token)
  } catch (error) {
    noteRequestFailure(error)
    throw error
  }
}

export async function getConfig(): Promise<Reply<'dart.config'>> {
  const token = readToken()
  if ('failure' in token) {
    return token.failure
  }
  try {
    return { ok: true, config: await readConfig(token.token) }
  } catch (error) {
    return toDartFailure(error, 'load')
  }
}
