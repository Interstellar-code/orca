import type { DartComment, DartCommentPage } from '../../../../../shared/dart/dart-types'
import type { RuntimeClientTarget } from '../../../../../shared/runtime-client-target'
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
  let rawTotalCount = 0
  let offset = 0
  do {
    const page = await dartListCommentsForTarget(target, {
      taskId,
      limit: 250,
      offset
    })
    if (!page.ok) {
      return page
    }
    totalCount = page.totalCount
    const rawCount = page.rawCount ?? page.comments.length
    if (!Number.isInteger(rawCount) || rawCount < 0 || rawCount < page.comments.length) {
      throw new Error(taskProviderErrorText(undefined, 'dart.loadFailed'))
    }
    offset += rawCount
    if (rawCount <= 0 && offset < totalCount) {
      throw new Error(taskProviderErrorText(undefined, 'dart.loadFailed'))
    }
    for (const comment of page.comments) {
      if (ids.has(comment.id)) {
        throw new Error(taskProviderErrorText(undefined, 'dart.loadFailed'))
      }
      ids.add(comment.id)
      comments.push(comment)
    }
  } while (offset < totalCount)
  return { ok: true, comments, totalCount, rawCount: rawTotalCount }
}

export async function reloadDartComments(args: {
  identity: DartTaskIdentity
  target: RuntimeClientTarget
  isLatestRead: () => boolean
  onError: () => void
  applyCommentsRead: (
    result: DartClientResult<DartCommentPage>,
    current: boolean,
    reload: boolean
  ) => void
}): Promise<void> {
  const read = await readPastDartWrites({
    captureEpoch: () => captureDartEpoch(args.identity),
    force: true,
    read: () => readAllDartComments(args.target, args.identity.taskId)
  }).catch(() => null)
  if (!read && args.isLatestRead()) {
    args.onError()
  }
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
