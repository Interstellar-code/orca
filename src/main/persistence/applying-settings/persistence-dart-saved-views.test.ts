import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { closeTestStores, createStore, testState } from '../persistence-test-harness'
import {
  normalizeDartSavedViewState,
  type DartSavedViewState
} from '../../../shared/dart/dart-saved-views'
vi.mock('electron', () => ({ app: { getPath: () => testState.dir } }))
vi.mock('../../telemetry/client', () => ({ track: vi.fn() }))
beforeEach(() => {
  testState.dir = mkdtempSync(join(tmpdir(), 'orca-dart-saved-views-'))
})
afterEach(async () => {
  await closeTestStores()
  rmSync(testState.dir, { recursive: true, force: true })
})
it('persists saved views and the active selection across a profile reload', async () => {
  const filters = {
    mine: false,
    status: 'To-do',
    dartboard: 'Sprint 1',
    search: 'login',
    tag: null,
    priority: 'High',
    onHold: true
  }
  const state: DartSavedViewState = {
    views: [
      { id: 'a', name: 'Login work', filters, layout: 'board', showEmptyColumns: false },
      {
        id: 'b',
        name: 'Everything',
        filters: { ...filters, status: null },
        layout: 'list',
        showEmptyColumns: true
      }
    ],
    activeViewId: 'b'
  }
  const store = createStore()
  store.updateUI({ dartSavedViewState: state })
  store.flush()
  await closeTestStores()
  const reloaded = createStore()
  expect(normalizeDartSavedViewState(reloaded.getUI().dartSavedViewState)).toEqual(state)
})
