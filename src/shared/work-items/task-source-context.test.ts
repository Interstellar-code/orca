import { describe, expect, it } from 'vitest'
import {
  areTaskSourceContextsEqual,
  getTaskSourceCacheScope,
  normalizeStoredTaskSourceContext
} from './task-source-context'
import { TaskSourceContext as TaskSourceContextParam } from '../rpc-contract/automations/automation-params'

describe('Dart task sources', () => {
  const stored = {
    kind: 'task-source',
    provider: 'dart',
    projectId: 'project-1',
    hostId: 'local',
    providerIdentity: { provider: 'dart', userId: 'user-1' }
  }

  it('survives normalize, save and reload with its identity', () => {
    const context = normalizeStoredTaskSourceContext(stored)
    expect(context).toMatchObject({ provider: 'dart', providerIdentity: stored.providerIdentity })
    const reloaded = normalizeStoredTaskSourceContext(JSON.parse(JSON.stringify(context)))
    expect(areTaskSourceContextsEqual(context, reloaded)).toBe(true)
    expect(getTaskSourceCacheScope(reloaded!)).toContain(':user-1')
  })

  it('separates Dart sources signed in as different users', () => {
    const context = normalizeStoredTaskSourceContext(stored)
    const other = normalizeStoredTaskSourceContext({
      ...stored,
      providerIdentity: { provider: 'dart', userId: 'user-2' }
    })
    expect(areTaskSourceContextsEqual(context, other)).toBe(false)
    expect(getTaskSourceCacheScope(context!)).not.toBe(getTaskSourceCacheScope(other!))
  })

  it('validates a Dart identity in the RPC params', () => {
    expect(TaskSourceContextParam.safeParse(stored).success).toBe(true)
    expect(
      TaskSourceContextParam.safeParse({
        ...stored,
        providerIdentity: { provider: 'dart', userId: 44 }
      }).success
    ).toBe(false)
  })
})
