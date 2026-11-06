import { describe, expect, it } from 'vitest'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import { bumpProviderRuntimeSessionGeneration } from '@/lib/provider-runtime-context'
import { getDartReadScope } from './dart-read-coordination'
import {
  aliasPrefixesFor,
  bumpDartEpochs,
  captureDartEpoch,
  dartAccountIdentity,
  dartScopeHostKey,
  dartScopeViewerId,
  dartTaskIdentity,
  dartTaskIdentityKey,
  isDartEpochCurrent,
  registerDartCacheAlias
} from './dart-task-identity'

const TASK_ID = 'aB3dE5gH7jK9'

function explicitContext(env: string, userId: string | null, projectId = 'project-1') {
  const context: TaskSourceContext = {
    kind: 'task-source',
    provider: 'dart',
    projectId,
    hostId: `runtime:${env}`,
    providerIdentity: userId ? { provider: 'dart', userId } : null
  }
  return context
}

function registerExplicit(env: string, userId: string | null, projectId?: string) {
  const sourceContext = explicitContext(env, userId, projectId)
  const scope = getDartReadScope(null, sourceContext)
  registerDartCacheAlias(scope, userId)
  return { scope, prefix: scope.cachePrefix }
}

describe('dart task identity', () => {
  it('links an alias only with the same host and the same account key', () => {
    const env = 'identity-groups'
    const knownA = registerExplicit(env, 'user-a')
    const knownASecondProject = registerExplicit(env, 'user-a', 'project-2')
    const knownB = registerExplicit(env, 'user-b')
    const unknown = registerExplicit(env, null)
    const unknownSecondProject = registerExplicit(env, null, 'project-2')

    expect(aliasPrefixesFor(dartAccountIdentity(knownA.scope, 'user-a')).sort()).toEqual(
      [knownA.prefix, knownASecondProject.prefix].sort()
    )
    expect(aliasPrefixesFor(dartAccountIdentity(knownB.scope, 'user-b'))).toEqual([knownB.prefix])
    expect(aliasPrefixesFor(dartAccountIdentity(unknown.scope, null)).sort()).toEqual(
      [unknown.prefix, unknownSecondProject.prefix].sort()
    )
  })

  it('does not link the same account across hosts', () => {
    const first = registerExplicit('identity-host-one', 'user-a')
    const second = registerExplicit('identity-host-two', 'user-a')

    expect(aliasPrefixesFor(dartAccountIdentity(first.scope, 'user-a'))).toEqual([first.prefix])
    expect(aliasPrefixesFor(dartAccountIdentity(second.scope, 'user-a'))).toEqual([second.prefix])
    expect(dartTaskIdentityKey(dartTaskIdentity(first.scope, TASK_ID, 'user-a'))).not.toEqual(
      dartTaskIdentityKey(dartTaskIdentity(second.scope, TASK_ID, 'user-a'))
    )
  })

  it('meets the default-scope list and the explicit detail of one host and account', () => {
    const env = 'identity-pair'
    const settings = { activeRuntimeEnvironmentId: env }
    const defaultScope = getDartReadScope(settings)
    const explicitScope = getDartReadScope(settings, explicitContext(env, 'user-a'))
    registerDartCacheAlias(defaultScope, 'user-a')
    registerDartCacheAlias(explicitScope, 'user-a')

    expect(defaultScope.contextKey).not.toEqual(explicitScope.contextKey)
    expect(dartTaskIdentity(defaultScope, TASK_ID, 'user-a')).toEqual(
      dartTaskIdentity(explicitScope, TASK_ID, 'user-a')
    )
    expect(aliasPrefixesFor(dartTaskIdentity(explicitScope, TASK_ID, 'user-a')).sort()).toEqual(
      [defaultScope.contextKey, explicitScope.cachePrefix].sort()
    )
  })

  it('keeps the same identity across a session generation bump', () => {
    const settings = { activeRuntimeEnvironmentId: 'identity-generation' }
    const context = explicitContext('identity-generation', 'user-a')
    const before = dartTaskIdentity(getDartReadScope(settings, context), TASK_ID, 'user-a')

    bumpProviderRuntimeSessionGeneration()

    expect(dartTaskIdentity(getDartReadScope(settings, context), TASK_ID, 'user-a')).toEqual(before)
    expect(before.hostKey).toBe('runtime:identity-generation')
    expect(dartScopeHostKey(getDartReadScope(null))).toBe('local')
  })

  it('moves a default prefix when the same host later reads as a known account', () => {
    const scope = getDartReadScope({ activeRuntimeEnvironmentId: 'identity-reregister' })
    registerDartCacheAlias(scope, null)
    registerDartCacheAlias(scope, 'user-a')

    expect(aliasPrefixesFor(dartAccountIdentity(scope, null))).toEqual([])
    expect(aliasPrefixesFor(dartAccountIdentity(scope, 'user-a'))).toEqual([scope.contextKey])
  })

  it('takes the default scope viewer only from a status read for that host', () => {
    const scope = getDartReadScope({ activeRuntimeEnvironmentId: 'identity-viewer' })
    const dartStatus = { connected: true, viewer: { id: 'user-a', name: 'Alex Example' } }

    expect(dartScopeViewerId({ dartStatus, dartStatusContextKey: scope.contextKey }, scope)).toBe(
      'user-a'
    )
    expect(dartScopeViewerId({ dartStatus, dartStatusContextKey: 'local#0' }, scope)).toBeNull()
    expect(
      dartScopeViewerId(
        { dartStatus, dartStatusContextKey: scope.contextKey },
        scope,
        explicitContext('identity-viewer', 'user-b')
      )
    ).toBe('user-b')
  })
})

describe('dart read epochs', () => {
  const scope = getDartReadScope({ activeRuntimeEnvironmentId: 'epoch-host' })
  const other = getDartReadScope({ activeRuntimeEnvironmentId: 'epoch-other-host' })

  it('drops a task read after a write to that task, not after a write to another task', () => {
    const identity = dartTaskIdentity(scope, 'epochTask001', 'user-a')
    const captured = captureDartEpoch(identity)

    bumpDartEpochs(dartTaskIdentity(scope, 'epochTask002', 'user-a'))
    expect(isDartEpochCurrent(captured)).toBe(true)

    bumpDartEpochs(identity)
    expect(isDartEpochCurrent(captured)).toBe(false)
  })

  it('drops a list read after any write on its host, not on another host', () => {
    const captured = captureDartEpoch(dartAccountIdentity(scope, 'user-a'))

    bumpDartEpochs(dartTaskIdentity(other, 'epochTask003', 'user-a'))
    expect(isDartEpochCurrent(captured)).toBe(true)

    bumpDartEpochs(dartTaskIdentity(scope, 'epochTask003', 'user-a'))
    expect(isDartEpochCurrent(captured)).toBe(false)
  })
})
