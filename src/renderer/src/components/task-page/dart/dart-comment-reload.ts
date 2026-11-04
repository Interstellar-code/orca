import type { DartCommentPage } from '../../../../../shared/dart/dart-types'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import { taskProviderErrorMessage, taskProviderErrorText } from '@/lib/task-provider-error-copy'
import type { DartClientResult } from '@/runtime/runtime-dart-client'
import { captureDartEpoch, type DartTaskIdentity } from '@/store/slices/dart/dart-task-identity'
import { readPastDartWrites } from './dart-stale-read'

export async function reloadDartComments(args: {
  identity: DartTaskIdentity
  sourceContext: TaskSourceContext | null
  listDartComments: (
    taskId: string,
    options: { sourceContext: TaskSourceContext | null; force: boolean }
  ) => Promise<DartClientResult<DartCommentPage>>
  isLatestRead: () => boolean
  applyCommentsRead: (
    result: DartClientResult<DartCommentPage>,
    current: boolean,
    reload: boolean
  ) => void
}): Promise<void> {
  const read = await readPastDartWrites({
    captureEpoch: () => captureDartEpoch(args.identity),
    force: true,
    read: () =>
      args.listDartComments(args.identity.taskId, {
        sourceContext: args.sourceContext,
        force: true
      })
  }).catch(() => null)
  if (read && args.isLatestRead()) {
    args.applyCommentsRead(read.result, read.current, true)
    if (!read.result.ok) {
      throw new Error(taskProviderErrorMessage(read.result))
    }
    if (!read.current) {
      throw new Error(taskProviderErrorText(undefined, 'dart.loadFailed'))
    }
    return
  }
  throw new Error(taskProviderErrorText(undefined, 'dart.loadFailed'))
}
