import type { DartComment } from '../../../../../shared/dart/dart-types'
import { dartDraftKeyParts, getDraft } from './dart-draft-store'
import { getDartCommentSendState } from './dart-comment-send-state'

/**
 * T5 item 9: who a draft replies to is part of the draft key, not of the mounted composer.
 * Keyed by the same `draftKey` as the draft text, so closing the sheet, switching the task
 * or remounting the section restores the banner and the `parentId` instead of silently
 * posting a root comment.
 *
 * The target is deliberately independent of the bounded draft store: an empty reply is not
 * persisted there (a full store would evict it), and the composer clears the target when it
 * clears the draft of a sent comment.
 */
const replyTargets = new Map<string, DartComment>()
const listeners = new Set<() => void>()

export function subscribeDartReplyTargets(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getDartReplyTarget(draftKey: string): DartComment | null {
  return replyTargets.get(draftKey) ?? null
}

/** `null` clears the target, the same way cancelling a reply does. */
export function setDartReplyTarget(draftKey: string, comment: DartComment | null): void {
  if (!comment) {
    if (!replyTargets.delete(draftKey)) {
      return
    }
  } else {
    if (replyTargets.get(draftKey) === comment) {
      return
    }
    // Insertion order is last-write order: the first entry is the stalest abandoned reply.
    replyTargets.delete(draftKey)
    replyTargets.set(draftKey, comment)
    while (replyTargets.size > MAX_REPLY_TARGETS) {
      const oldest = [...replyTargets.keys()].find((key) => {
        const state = getDartCommentSendState(key)
        const text = state.text ?? getDraft(key)
        return key !== draftKey && !state.inFlight && !(typeof text === 'string' && text.trim())
      })
      if (oldest === undefined) {
        break
      }
      replyTargets.delete(oldest)
    }
  }
  for (const listener of listeners) {
    listener()
  }
}

export function clearDartReplyTargetsForHost(hostKey: string): void {
  for (const key of replyTargets.keys()) {
    if (dartDraftKeyParts(key).hostKey === hostKey) {
      setDartReplyTarget(key, null)
    }
  }
}

// Empty abandoned replies are bounded; targets with retained text must survive eviction.
const MAX_REPLY_TARGETS = 20
