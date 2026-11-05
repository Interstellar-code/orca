import type { DartComment } from '../../../../../shared/dart/dart-types'

function normalizeDartCommentText(value: string): string {
  return value
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim()
}

export function hasMatchingDartComment(
  comments: readonly DartComment[],
  viewerIdentities: readonly string[],
  body: string,
  parentId: string | null
): boolean {
  const identities = new Set(
    viewerIdentities.map((identity) => identity.trim().toLowerCase()).filter(Boolean)
  )
  const normalizedBody = normalizeDartCommentText(body)
  return comments.some(
    (comment) =>
      identities.has(comment.author.trim().toLowerCase()) &&
      normalizeDartCommentText(comment.text) === normalizedBody &&
      (comment.parentId ?? null) === parentId
  )
}

export function canSubmitDartComment(
  duplicate: { body: string; parentId: string | null } | null,
  body: string,
  parentId: string | null,
  postAnyway: boolean
): boolean {
  const matches =
    duplicate !== null &&
    normalizeDartCommentText(duplicate.body) === normalizeDartCommentText(body) &&
    duplicate.parentId === parentId
  return postAnyway === matches
}
