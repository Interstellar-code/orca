import type { RuntimeRpcResponse } from '../../../../../shared/remote-runtime/rpc/runtime-rpc-envelope'
import type { RuntimeStatus } from '../../../../../shared/remote-runtime/session-graph/runtime-session-contracts'
import { assertRuntimeStatusCompatible } from './runtime-protocol-compat'
import { callRuntimeEnvironmentWithRevision } from '../calls/runtime-rpc-environment-call'
import { unwrapRuntimeRpcResult } from '../calls/runtime-rpc-result'
import {
  bumpRuntimeCompatibilityGeneration,
  compatibilityEntry,
  getCachedRuntimeCompatibilityCheck,
  rememberRuntimeEnvironmentCompatibility,
  runtimeCompatibilityChecks,
  runtimeCompatibilityGeneration
} from './runtime-compatibility-cache'

export async function ensureRuntimeEnvironmentCompatible(
  environmentId: string,
  options: {
    timeoutMs?: number
    reuseRecentCompatibilityFailure?: boolean
    expectedEnvironmentPairingRevision?: number
  } = {}
): Promise<RuntimeStatus | null> {
  const cached = getCachedRuntimeCompatibilityCheck(environmentId, options)
  if (cached) {
    await cached.check
    return cached.status
  }
  const entry = compatibilityEntry()
  const check = (async () => {
    const response = await callRuntimeEnvironmentWithRevision({
      environmentId,
      method: 'status.get',
      params: undefined,
      timeoutMs: options.timeoutMs,
      expectedEnvironmentPairingRevision: options.expectedEnvironmentPairingRevision
    })
    const status = unwrapRuntimeRpcResult<RuntimeStatus>(
      response as RuntimeRpcResponse<RuntimeStatus>
    )
    assertRuntimeStatusCompatible(status)
    entry.status = status
    entry.statusCheckedAt = Date.now()
    entry.statusObservedAt = entry.statusCheckedAt
    bumpRuntimeCompatibilityGeneration(environmentId)
  })()
  entry.check = check
  rememberRuntimeEnvironmentCompatibility(environmentId, entry)
  try {
    await check
    if (runtimeCompatibilityChecks.get(environmentId) === entry) {
      entry.provenCompatible = true
      bumpRuntimeCompatibilityGeneration(environmentId)
    }
    return entry.status
  } catch (error) {
    if (runtimeCompatibilityChecks.get(environmentId) === entry) {
      // Startup repo/group/folder bursts should pay one offline-host timeout, not three.
      entry.failedAt = Date.now()
      bumpRuntimeCompatibilityGeneration(environmentId)
    }
    throw error
  }
}

export async function getRuntimeEnvironmentStatus(
  environmentId: string,
  timeoutMs?: number
): Promise<RuntimeStatus> {
  const trimmed = environmentId.trim()
  const entry = compatibilityEntry()
  // Publish before awaiting so concurrent cold capability reads share this status probe.
  const check = (async () => {
    const response = await window.api.runtimeEnvironments.call({
      selector: trimmed,
      method: 'status.get',
      timeoutMs
    })
    const status = unwrapRuntimeRpcResult<RuntimeStatus>(
      response as RuntimeRpcResponse<RuntimeStatus>
    )
    assertRuntimeStatusCompatible(status)
    entry.status = status
    entry.statusCheckedAt = Date.now()
    entry.statusObservedAt = entry.statusCheckedAt
    entry.provenCompatible = true
    bumpRuntimeCompatibilityGeneration(trimmed)
  })()
  entry.check = check
  rememberRuntimeEnvironmentCompatibility(trimmed, entry)
  try {
    await check
  } catch (error) {
    // Always-refetched probe failures must not remain cached verdicts; let next call retry.
    if (runtimeCompatibilityChecks.get(trimmed) === entry) {
      runtimeCompatibilityChecks.delete(trimmed)
      bumpRuntimeCompatibilityGeneration(trimmed)
    }
    throw error
  }
  if (!entry.status) {
    // Unreachable: a resolved probe always assigns status; narrows the type.
    throw new Error('Runtime status probe resolved without a status.')
  }
  return entry.status
}

const latestDetachedProbe = new Map<string, symbol>()

// Why: a fresh probe must never replace, fail or delay the shared entry other RPCs await; its answer is
// published only if it is the newest probe and the cache saw no write, clear or status observation since.
export async function probeRuntimeEnvironmentStatusDetached(
  environmentId: string,
  timeoutMs?: number
): Promise<RuntimeStatus> {
  const token = Symbol(environmentId)
  const startedAt = runtimeCompatibilityGeneration(environmentId)
  latestDetachedProbe.set(environmentId, token)
  try {
    const response = await window.api.runtimeEnvironments.call({
      selector: environmentId,
      method: 'status.get',
      timeoutMs
    })
    const status = unwrapRuntimeRpcResult<RuntimeStatus>(
      response as RuntimeRpcResponse<RuntimeStatus>
    )
    assertRuntimeStatusCompatible(status)
    if (
      latestDetachedProbe.get(environmentId) === token &&
      runtimeCompatibilityGeneration(environmentId) === startedAt
    ) {
      rememberRuntimeEnvironmentCompatibility(environmentId, compatibilityEntry(status))
    }
    return status
  } finally {
    if (latestDetachedProbe.get(environmentId) === token) {
      latestDetachedProbe.delete(environmentId)
    }
  }
}
