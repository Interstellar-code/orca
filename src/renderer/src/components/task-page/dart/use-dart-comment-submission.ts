import { useCallback, useEffect, useRef } from 'react'
import type { DartComment } from '../../../../../shared/dart/dart-types'
import {
  beginDartCommentSend,
  dartCommentReadFailedNotice,
  dartCommentViewerUnknownNotice,
  dartCommentRefusedNotice,
  dartCommentUnknownNotice,
  endDartCommentSend,
  draftCommentText,
  getDartCommentSendState,
  patchDartCommentSendState,
  readDartCommentSubmission,
  reconcileDartCommentRead
} from './dart-comment-send-state'
import { clearCompletedDartComment } from './dart-comment-completion'
import { canSubmitDartComment, hasMatchingDartComment } from './dart-comment-duplicate'
import type { DartDetailCommentsApi } from './dart-detail-contracts'

export function useDartCommentSubmission({
  draftKey,
  replyTo,
  text,
  onAddComment,
  reloadComments,
  appendLocalComment,
  readLatestComments,
  viewerName,
  viewerEmail
}: {
  draftKey: string
  replyTo: DartComment | null
  text: string
  onAddComment: DartDetailCommentsApi['onAddComment']
  reloadComments: DartDetailCommentsApi['reloadComments']
  appendLocalComment: DartDetailCommentsApi['appendLocalComment']
  readLatestComments: () => Promise<DartComment[]>
  viewerName: string | null
  viewerEmail: string | null
}): {
  submit: (options: { postAnyway: boolean }) => Promise<void>
  recheck: () => Promise<void>
} {
  const mountedRef = useRef(true)
  const currentReplyId = useRef(replyTo?.id ?? null)
  currentReplyId.current = replyTo?.id ?? null
  const currentDraftKey = useRef(draftKey)
  currentDraftKey.current = draftKey
  const currentContext = useRef({ viewerName, viewerEmail, onAddComment, readLatestComments })
  currentContext.current = { viewerName, viewerEmail, onAddComment, readLatestComments }
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const submit = useCallback(
    async ({ postAnyway }: { postAnyway: boolean }): Promise<void> => {
      const before = getDartCommentSendState(draftKey)
      const submission = readDartCommentSubmission(text)
      if (before.inFlight || submission.status === 'empty') {
        return
      }
      if (before.recheckFailed) {
        patchDartCommentSendState(draftKey, { recheckFailed: false })
      }
      if (submission.status === 'refused') {
        patchDartCommentSendState(draftKey, {
          refusalNotice: submission.notice,
          recheckFailed: false
        })
        return
      }
      const parentId = replyTo?.id ?? null
      if (
        !canSubmitDartComment(before.duplicate, submission.body, parentId, postAnyway) ||
        !beginDartCommentSend(draftKey)
      ) {
        return
      }
      try {
        const viewerIdentities = [viewerName, viewerEmail].filter(
          (value): value is string => !!value?.trim()
        )
        if (viewerIdentities.length === 0) {
          patchDartCommentSendState(draftKey, {
            refusalNotice: dartCommentViewerUnknownNotice(),
            recheckFailed: false
          })
          return
        }
        let comments: DartComment[]
        try {
          comments = await readLatestComments()
        } catch {
          patchDartCommentSendState(draftKey, {
            duplicate: null,
            refusalNotice: dartCommentReadFailedNotice(),
            recheckFailed: false
          })
          return
        }
        const latest = getDartCommentSendState(draftKey)
        if (
          !mountedRef.current ||
          currentDraftKey.current !== draftKey ||
          latest.generation !== before.generation ||
          currentContext.current.viewerName !== viewerName ||
          currentContext.current.viewerEmail !== viewerEmail ||
          currentContext.current.onAddComment !== onAddComment ||
          currentContext.current.readLatestComments !== readLatestComments ||
          (latest.text ?? draftCommentText(draftKey)) !== text ||
          currentReplyId.current !== parentId
        ) {
          return
        }
        if (
          !postAnyway &&
          hasMatchingDartComment(comments, viewerIdentities, submission.body, parentId)
        ) {
          patchDartCommentSendState(draftKey, {
            duplicate: { body: submission.body, parentId },
            refusalNotice: null
          })
          return
        }
        patchDartCommentSendState(draftKey, { duplicate: null, refusalNotice: null })
        const result = await onAddComment({
          text: submission.body,
          ...(parentId ? { parentId } : {})
        }).catch(() => ({ ok: false as const, outcome: 'unknown' as const, error: '' }))
        const current = getDartCommentSendState(draftKey)
        if (result.ok) {
          if (
            (current.text ?? draftCommentText(draftKey)) === text &&
            current.generation === before.generation &&
            currentReplyId.current === parentId &&
            currentDraftKey.current === draftKey
          ) {
            clearCompletedDartComment(draftKey, parentId)
          }
          appendLocalComment(result.comment)
          await reloadComments().catch(() => {})
        } else if (result.outcome === 'unknown') {
          if (current.generation === before.generation) {
            patchDartCommentSendState(draftKey, {
              notice: dartCommentUnknownNotice(),
              unknownSubmission: {
                body: text,
                parentId,
                priorIds: comments.map(({ id }) => id)
              }
            })
          }
          await reloadComments().catch(() => {})
        } else {
          patchDartCommentSendState(draftKey, { refusalNotice: dartCommentRefusedNotice(result) })
        }
      } finally {
        endDartCommentSend(draftKey)
      }
    },
    [
      appendLocalComment,
      draftKey,
      onAddComment,
      readLatestComments,
      reloadComments,
      replyTo,
      text,
      viewerName,
      viewerEmail
    ]
  )

  const recheck = useCallback(async (): Promise<void> => {
    const before = getDartCommentSendState(draftKey)
    const body = before.unknownSubmission?.body ?? before.text ?? draftCommentText(draftKey)
    const parentId = before.unknownSubmission
      ? before.unknownSubmission.parentId
      : currentReplyId.current
    const viewerIdentities = [viewerName, viewerEmail].filter(
      (value): value is string => !!value?.trim()
    )
    try {
      const comments = await readLatestComments()
      if (
        !mountedRef.current ||
        currentDraftKey.current !== draftKey ||
        getDartCommentSendState(draftKey).generation !== before.generation ||
        getDartCommentSendState(draftKey).notice !== before.notice ||
        currentContext.current.viewerName !== viewerName ||
        currentContext.current.viewerEmail !== viewerEmail ||
        currentContext.current.readLatestComments !== readLatestComments
      ) {
        return
      }
      patchDartCommentSendState(draftKey, { recheckFailed: false })
      if (
        reconcileDartCommentRead(
          draftKey,
          before,
          body,
          parentId,
          viewerIdentities,
          comments,
          currentReplyId.current
        )
      ) {
        clearCompletedDartComment(draftKey, parentId)
      }
    } catch {
      if (
        mountedRef.current &&
        currentDraftKey.current === draftKey &&
        currentContext.current.viewerName === viewerName &&
        currentContext.current.viewerEmail === viewerEmail &&
        currentContext.current.readLatestComments === readLatestComments &&
        getDartCommentSendState(draftKey).generation === before.generation &&
        getDartCommentSendState(draftKey).notice === before.notice
      ) {
        patchDartCommentSendState(draftKey, {
          refusalNotice: dartCommentReadFailedNotice(),
          recheckFailed: true
        })
      }
    }
  }, [draftKey, readLatestComments, viewerName, viewerEmail])

  return { submit, recheck }
}
