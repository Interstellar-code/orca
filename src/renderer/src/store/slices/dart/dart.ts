import type { StateCreator } from 'zustand'
import type { AppState } from '../../types'
import { createDartConnectionActions } from './dart-connection-actions'
import { createDartReadActions } from './dart-read-actions'
import type { DartSlice } from './dart-slice-contract'

export type { DartSlice } from './dart-slice-contract'

export const createDartSlice: StateCreator<AppState, [], [], DartSlice> = (set, get) => ({
  dartStatus: { connected: false, viewer: null },
  dartStatusChecked: false,
  dartStatusContextKey: null,
  dartUpdateRequired: false,
  dartConnectionRevisions: {},
  dartTaskCache: {},
  dartListCache: {},
  dartConfigCache: {},
  ...createDartConnectionActions(set, get),
  ...createDartReadActions(set, get)
})
