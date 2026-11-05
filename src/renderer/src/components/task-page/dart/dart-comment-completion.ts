import { clearDraft } from './dart-draft-store'
import { patchDartCommentSendState } from './dart-comment-send-state'
import { getDartReplyTarget, setDartReplyTarget } from './dart-reply-target-store'

export function clearCompletedDartComment(draftKey: string, sentParentId?: string | null): void {
  clearDraft(draftKey)
  const target = getDartReplyTarget(draftKey)
  if (sentParentId === undefined || (target?.id ?? null) === sentParentId) {
    setDartReplyTarget(draftKey, null)
  }
  patchDartCommentSendState(draftKey, {
    text: null,
    saved: true,
    duplicate: null,
    notice: null,
    unknownSubmission: null,
    refusalNotice: null,
    recheckFailed: false
  })
}
