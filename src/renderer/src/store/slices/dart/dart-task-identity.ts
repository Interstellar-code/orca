import { getEnvironmentRuntimeContextKey } from '@/lib/provider-runtime-context'
import { runtimeTargetEnvironmentId } from '@/runtime/runtime-client-target'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import type { AppState } from '../../types'
import type { DartReadScope } from './dart-read-coordination'

export const UNKNOWN_DART_ACCOUNT = 'unknown'

/** Host plus account: the group that cache aliases, list invalidation and epochs work within. */
export type DartAccountIdentity = {
  hostKey: string
  accountKey: string
}

export type DartTaskIdentity = DartAccountIdentity & {
  taskId: string
}

export type DartEpochSnapshot = {
  key: string
  epoch: number
}

// One group per prefix: re-registering moves it, so a prefix never serves two accounts at once.
const aliasGroups = new Map<string, DartAccountIdentity>()
const epochs = new Map<string, number>()

function scopeHostKey(scope: DartReadScope): string {
  return getEnvironmentRuntimeContextKey(runtimeTargetEnvironmentId(scope.target))
}

// Not `haveConflictingTaskSourceAccounts`: its "missing id never conflicts" rule would join A and B through an unknown alias.
function dartAccountKey(viewerId: string | null | undefined): string {
  return viewerId?.trim() || UNKNOWN_DART_ACCOUNT
}

/** An explicit scope names its account; the default scope uses the viewer only when the status was read for that host. */
export function dartScopeViewerId(
  state: Pick<AppState, 'dartStatus' | 'dartStatusContextKey'>,
  scope: DartReadScope,
  sourceContext?: TaskSourceContext | null
): string | null {
  if (sourceContext) {
    const identity = sourceContext.providerIdentity
    return identity?.provider === 'dart' ? (identity.userId ?? null) : null
  }
  return state.dartStatusContextKey === scope.contextKey
    ? (state.dartStatus.viewer?.id ?? null)
    : null
}

export function dartAccountIdentity(
  scope: DartReadScope,
  viewerId: string | null | undefined
): DartAccountIdentity {
  return { hostKey: scopeHostKey(scope), accountKey: dartAccountKey(viewerId) }
}

export function dartTaskIdentity(
  scope: DartReadScope,
  taskId: string,
  viewerId: string | null | undefined
): DartTaskIdentity {
  return { ...dartAccountIdentity(scope, viewerId), taskId }
}

export function dartTaskIdentityKey(identity: DartTaskIdentity): string {
  return JSON.stringify([identity.hostKey, identity.accountKey, identity.taskId])
}

export function registerDartCacheAlias(
  scope: DartReadScope,
  viewerId: string | null | undefined
): void {
  aliasGroups.set(scope.cachePrefix ?? scope.contextKey, dartAccountIdentity(scope, viewerId))
}

export function aliasPrefixesFor(identity: DartAccountIdentity): string[] {
  const prefixes: string[] = []
  for (const [prefix, group] of aliasGroups) {
    if (group.hostKey === identity.hostKey && group.accountKey === identity.accountKey) {
      prefixes.push(prefix)
    }
  }
  return prefixes
}

function hostEpochKey(hostKey: string): string {
  return JSON.stringify([hostKey])
}

function bump(key: string): void {
  epochs.set(key, (epochs.get(key) ?? 0) + 1)
}

export function bumpDartEpochs(identity: DartTaskIdentity | DartAccountIdentity): void {
  bump(hostEpochKey(identity.hostKey))
  if ('taskId' in identity) {
    bump(dartTaskIdentityKey(identity))
  }
}

/** A task identity follows that task's writes; a list read passes its host and follows every write there. */
export function captureDartEpoch(
  identity: DartTaskIdentity | { hostKey: string }
): DartEpochSnapshot {
  const key = 'taskId' in identity ? dartTaskIdentityKey(identity) : hostEpochKey(identity.hostKey)
  return { key, epoch: epochs.get(key) ?? 0 }
}

export function isDartEpochCurrent(captured: DartEpochSnapshot): boolean {
  return (epochs.get(captured.key) ?? 0) === captured.epoch
}
