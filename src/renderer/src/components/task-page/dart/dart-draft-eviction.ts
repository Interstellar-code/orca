import { clearDartCommentSendState } from './dart-comment-send-state'
import {
  clearDartCreateSessionForDraftKey,
  isCreateDraftProtected
} from './dart-create-draft-accounting'
import { clearDraft, dirtyDraftEntries, type DartDraftValue } from './dart-draft-store'
import { setDartReplyTarget } from './dart-reply-target-store'

/** The draft a full-store warning offers to copy; `discardable` is false while its create may have landed. */
export type DartFullDraftTarget = { key: string; value: DartDraftValue; discardable: boolean }

/** The oldest draft that can be discarded; a protected New task draft is skipped, and only when nothing else is left is it offered copy-only. */
export function dartFullDraftTarget(): DartFullDraftTarget | null {
  const entries = dirtyDraftEntries()
  const discardable = entries.find((entry) => !isCreateDraftProtected(entry.key))
  if (discardable) {
    return { ...discardable, discardable: true }
  }
  return entries[0] ? { ...entries[0], discardable: false } : null
}

/** The one discard path for every drafts-full warning, so no kind of draft keeps stray state behind. */
export function discardDartDraft(key: string): boolean {
  if (isCreateDraftProtected(key)) {
    return false
  }
  clearDraft(key)
  clearDartCommentSendState(key)
  setDartReplyTarget(key, null)
  clearDartCreateSessionForDraftKey(key)
  return true
}
