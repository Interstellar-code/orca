// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  DartScopeReadResult,
  DartServerFilters
} from '@/components/task-page/dart/dart-board-contracts'
import { createTestStore } from '../store-test-helpers'
import { dartTaskFixture, installFakeDartRuntime } from './dart-fake-runtime.test-support'
import { getDartReadScope } from './dart-read-coordination'
import { dartScopeCacheKey } from './dart-scope-read-actions'

const FILTERS: DartServerFilters = { mine: false, dartboard: null, search: '' }
const FEATURES = { board: true }

let store: ReturnType<typeof createTestStore>

function scope() {
  return getDartReadScope(store.getState().settings)
}

function result(overrides: Partial<DartScopeReadResult> = {}): DartScopeReadResult {
  return {
    tasks: [dartTaskFixture('held00', { status: 'On Hold' })],
    openTotal: 1,
    doneTotal: 0,
    doneOffset: 0,
    incomplete: false,
    failure: null,
    ...overrides
  }
}

function publish(read: DartScopeReadResult, current = true): void {
  store.getState().publishDartScope(FILTERS, { result: read, current, scope: scope() })
}

function publicationId(): number | undefined {
  return store.getState().dartScopeMetaCache[dartScopeCacheKey(scope(), FILTERS)]?.publicationId
}

function evict(): void {
  store.setState({ dartListCache: {}, dartScopeMetaCache: {}, dartMountedScopeKey: null })
}

beforeEach(() => {
  installFakeDartRuntime()
  store = createTestStore()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('scope meta publicationId', () => {
  it('gives a first partial publish and a later full publish strictly larger ids', () => {
    publish(result({ failure: { reason: 'rateLimited', message: 'slow down' }, incomplete: true }))
    const partial = publicationId()
    publish(result())

    expect(partial).toBeGreaterThan(0)
    expect(publicationId()).toBeGreaterThan(partial ?? 0)
  })

  it('gives a republish after eviction of the same scope a new, larger id', () => {
    publish(result())
    const first = publicationId()
    evict()
    publish(result())

    expect(publicationId()).toBeGreaterThan(first ?? 0)
  })

  it('keeps the id across an overtaken write and a failed refresh that keeps the rows', () => {
    publish(result())
    const published = publicationId()
    expect(published).toBeGreaterThan(0)

    publish(result(), false)
    publish(result({ failure: { reason: 'error', message: 'down' } }))

    expect(publicationId()).toBe(published)
  })

  it('keeps the id when "Show 50 more" extends the read set', async () => {
    publish(result({ doneTotal: 3 }))
    const published = publicationId()
    expect(published).toBeGreaterThan(0)

    await store.getState().readMoreDone(FILTERS, { features: FEATURES, scope: scope() })

    expect(publicationId()).toBe(published)
  })
})
