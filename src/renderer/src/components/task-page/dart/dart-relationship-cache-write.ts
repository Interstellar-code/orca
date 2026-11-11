import type { DartTaskRelationships } from '../../../../../shared/dart/dart-types'
import { useAppStore } from '@/store'
import { getDartReadScope } from '@/store/slices/dart/dart-read-coordination'
import {
  dartScopeHostKey,
  dartTaskIdentityKey,
  type DartTaskIdentity
} from '@/store/slices/dart/dart-task-identity'
import type { DartRelationshipCacheEntry } from './dart-board-contracts'

/** The publication of the mounted board, when it shows this host: entries stamped with it count as read there (D14.3). */
function currentPublicationId(hostKey: string): number | undefined {
  const state = useAppStore.getState()
  const mountedKey = state.dartMountedScopeKey
  if (!mountedKey || dartScopeHostKey(getDartReadScope(state.settings)) !== hostKey) {
    return undefined
  }
  return state.dartScopeMetaCache[mountedKey]?.publicationId
}

/** `undefined` is "Dart returned no links data". */
export function writeDartRelationshipCache(
  identity: DartTaskIdentity,
  relationships: DartTaskRelationships | undefined
): void {
  const publicationId = currentPublicationId(identity.hostKey)
  const entry: DartRelationshipCacheEntry = {
    state: relationships ? 'known' : 'notChecked',
    relationships: relationships ?? null,
    fetchedAt: Date.now(),
    error: null,
    ...(publicationId === undefined ? {} : { publicationId })
  }
  useAppStore.setState((state) => ({
    dartRelationshipCache: {
      ...state.dartRelationshipCache,
      [dartTaskIdentityKey(identity)]: entry
    }
  }))
}
