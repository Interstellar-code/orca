import type { DartComment } from '../../../../../shared/dart/dart-types'

/** One comment with its place in the thread: 0 is a top-level comment. */
export type DartCommentThreadEntry = {
  comment: DartComment
  depth: number
}

// A comment without a usable time sorts last; its place in the list breaks the tie.
function commentTime(comment: DartComment): number {
  const time = comment.createdAt ? Date.parse(comment.createdAt) : Number.NaN
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time
}

/** Groups the flat list by `parentId`, depth first, oldest first within a thread. */
export function buildDartCommentThread(comments: readonly DartComment[]): DartCommentThreadEntry[] {
  const order = new Map<string, number>()
  for (const [index, comment] of comments.entries()) {
    if (!order.has(comment.id)) {
      order.set(comment.id, index)
    }
  }
  const byId = new Map<string, DartComment>()
  for (const comment of comments) {
    if (!byId.has(comment.id)) {
      byId.set(comment.id, comment)
    }
  }
  const childrenOf = new Map<string, DartComment[]>()
  const roots: DartComment[] = []
  for (const comment of comments) {
    const parentId = comment.parentId
    // A reply whose parent is not on this page has no place to nest under.
    if (parentId && parentId !== comment.id && byId.has(parentId)) {
      const siblings = childrenOf.get(parentId)
      if (siblings) {
        siblings.push(comment)
      } else {
        childrenOf.set(parentId, [comment])
      }
    } else {
      roots.push(comment)
    }
  }
  const oldestFirst = (left: DartComment, right: DartComment): number => {
    const leftTime = commentTime(left)
    const rightTime = commentTime(right)
    if (leftTime !== rightTime) {
      return leftTime < rightTime ? -1 : 1
    }
    return (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0)
  }
  for (const siblings of childrenOf.values()) {
    siblings.sort(oldestFirst)
  }
  roots.sort(oldestFirst)
  const entries: DartCommentThreadEntry[] = []
  const visited = new Set<string>()
  const walk = (comment: DartComment, depth: number): void => {
    if (visited.has(comment.id)) {
      return
    }
    visited.add(comment.id)
    entries.push({ comment, depth })
    for (const child of childrenOf.get(comment.id) ?? []) {
      walk(child, depth + 1)
    }
  }
  for (const root of roots) {
    walk(root, 0)
  }
  // Comments in a cycle never become roots, but they must still show.
  for (const comment of comments) {
    walk(comment, 0)
  }
  return entries
}
