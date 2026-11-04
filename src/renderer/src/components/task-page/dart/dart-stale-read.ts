import { isDartEpochCurrent, type DartEpochSnapshot } from '@/store/slices/dart/dart-task-identity'

const MAX_STALE_REREADS = 2

/** T3.5: a read that a write overtook is dropped and read again, forced; `current: false` means every attempt was overtaken. */
export async function readPastDartWrites<T>(args: {
  captureEpoch: () => DartEpochSnapshot
  read: (force: boolean) => Promise<T>
  force: boolean
  cancelled?: () => boolean
}): Promise<{ result: T; current: boolean }> {
  let captured = args.captureEpoch()
  let result = await args.read(args.force)
  for (let rereads = 0; rereads < MAX_STALE_REREADS; rereads += 1) {
    if (isDartEpochCurrent(captured) || args.cancelled?.()) {
      break
    }
    captured = args.captureEpoch()
    result = await args.read(true)
  }
  return { result, current: isDartEpochCurrent(captured) }
}
