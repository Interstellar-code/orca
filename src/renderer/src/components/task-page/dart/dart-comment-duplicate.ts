import type { DartComment } from '../../../../../shared/dart/dart-types'

export function hasRecentDartComment(
  comments: readonly DartComment[],
  viewerName: string,
  body: string,
  parentId: string | null,
  now: number
): boolean {
  return comments.some((comment) => {
    const created = comment.createdAt ? Date.parse(comment.createdAt) : Number.NaN
    return (
      comment.author === viewerName &&
      comment.text.trim() === body.trim() &&
      (comment.parentId ?? null) === parentId &&
      created <= now &&
      created >= now - 10 * 60 * 1000
    )
  })
}

export function canSubmitDartComment(
  duplicate: { body: string; parentId: string | null } | null,
  body: string,
  parentId: string | null,
  postAnyway: boolean
): boolean {
  const matches = duplicate?.body === body && duplicate.parentId === parentId
  return postAnyway === matches
}
