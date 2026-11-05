import type { DartComment, DartCommentPage } from '../../../../../shared/dart/dart-types'
import type { RuntimeClientTarget } from '../../../../../shared/runtime-client-target'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import { taskProviderErrorMessage, taskProviderErrorText } from '@/lib/task-provider-error-copy'
import { dartListCommentsForTarget, type DartClientResult } from '@/runtime/runtime-dart-client'
import { captureDartEpoch, type DartTaskIdentity } from '@/store/slices/dart/dart-task-identity'
import { readPastDartWrites } from './dart-stale-read'

export async function readAllDartComments(
  target: RuntimeClientTarget,
  taskId: string
): Promise<DartClientResult<DartCommentPage>> {
  const comments: DartComment[] = []
  const ids = new Set<string>()
  let totalCount = 0
  do {
    const page = await dartListCommentsForTarget(target, {
      taskId,
      limit: 250,
      offset: comments.length
    })
    if (!page.ok) {
      return page
    }
    totalCount = page.totalCount
    if (page.comments.length === 0 && comments.length < totalCount) {
      throw new Error(taskProviderErrorText(undefined, 'dart.loadFailed'))
    }
    for (const comment of page.comments) {
      if (ids.has(comment.id)) {
        throw new Error(taskProviderErrorText(undefined, 'dart.loadFailed'))
      }
      ids.add(comment.id)
      comments.push(comment)
    }
  } while (comments.length < totalCount)
  return { ok: true, comments, totalCount }
}

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
