import type { StateCreator } from 'zustand'
import type { AppState } from '../../types'
import { createDartConnectionActions } from './dart-connection-actions'
import { createDartOnHoldRelationshipActions } from './dart-on-hold-relationship-actions'
import { createDartReadActions } from './dart-read-actions'
import { createDartScopeReadActions } from './dart-scope-read-actions'
import type { DartSlice } from './dart-slice-contract'
import { createDartTaskPatchActions } from './dart-task-patch-action'
import { createDartWriteActions } from './dart-write-actions'

export type { DartSlice } from './dart-slice-contract'

export const createDartSlice: StateCreator<AppState, [], [], DartSlice> = (set, get) => ({
  dartStatus: { connected: false, viewer: null },
  dartStatusChecked: false,
  dartStatusContextKey: null,
  dartLastSeenViewers: {},
  dartUpdateRequired: false,
  dartTaskCache: {},
  dartListCache: {},
  dartConfigCache: {},
  dartRelationshipCache: {},
  dartScopeMetaCache: {},
  dartMountedScopeKey: null,
  ...createDartConnectionActions(set, get),
  ...createDartReadActions(set, get),
  ...createDartOnHoldRelationshipActions(set, get),
  ...createDartScopeReadActions(set, get),
  ...createDartTaskPatchActions(set),
  ...createDartWriteActions(set, get)
})
