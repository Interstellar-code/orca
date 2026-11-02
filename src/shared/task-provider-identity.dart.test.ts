import { describe, expect, it } from 'vitest'
import {
  areTaskProviderIdentitiesEqual,
  isStoredTaskProviderIdentity,
  normalizeTaskProviderIdentity,
  taskProviderIdentityCachePart
} from './task-provider-identity'

describe('Dart task provider identity', () => {
  it('normalizes the signed-in user id and drops whitespace-only ids', () => {
    expect(normalizeTaskProviderIdentity('dart', { provider: 'dart', userId: ' u-1 ' })).toEqual({
      provider: 'dart',
      userId: 'u-1'
    })
    expect(normalizeTaskProviderIdentity('dart', { provider: 'dart', userId: '  ' })).toEqual({
      provider: 'dart',
      userId: null
    })
  })

  it('separates identities by user id', () => {
    const a = { provider: 'dart', userId: 'u-1' } as const
    expect(areTaskProviderIdentitiesEqual(a, { provider: 'dart', userId: 'u-1' })).toBe(true)
    expect(areTaskProviderIdentitiesEqual(a, { provider: 'dart', userId: 'u-2' })).toBe(false)
  })

  it('scopes caches by user id', () => {
    expect(taskProviderIdentityCachePart({ provider: 'dart', userId: 'u-1' })).toBe('u-1')
    expect(taskProviderIdentityCachePart({ provider: 'dart', userId: 'u-2' })).not.toBe(
      taskProviderIdentityCachePart({ provider: 'dart', userId: 'u-1' })
    )
  })

  it('accepts a stored Dart identity and rejects a non-string user id', () => {
    expect(isStoredTaskProviderIdentity('dart', { provider: 'dart', userId: 'u-1' })).toBe(true)
    expect(isStoredTaskProviderIdentity('dart', { provider: 'dart', userId: 7 })).toBe(false)
  })
})
