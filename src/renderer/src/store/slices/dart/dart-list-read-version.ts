import {
  captureDartEpoch,
  isDartEpochCurrent,
  type DartAccountIdentity
} from './dart-task-identity'

// A forced read supersedes every earlier read of its key, whatever order the replies land in.
const listReadVersions = new Map<string, number>()

/** `superseded` reads must not install; `invalidated` ones install as stale so the next read fetches. */
export function beginDartListRead(
  versionKey: string,
  force: boolean | undefined,
  account: DartAccountIdentity
): { superseded: () => boolean; invalidated: () => boolean } {
  const version = (listReadVersions.get(versionKey) ?? 0) + (force ? 1 : 0)
  listReadVersions.set(versionKey, version)
  const epoch = captureDartEpoch(account)
  return {
    superseded: () => listReadVersions.get(versionKey) !== version,
    invalidated: () => !isDartEpochCurrent(epoch)
  }
}
