import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { LoaderCircle, Send } from 'lucide-react'
import type { DartComment } from '../../../../../shared/dart/dart-types'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { ImeTextarea } from '@/lib/ime-text-field'
import { hasBoundedCommentBodyText } from '@/lib/comment-body-submit-state'
import { useDartCommentReplyEscape } from './use-dart-comment-reply-escape'
import { getScreenSubmitShortcutLabel, isScreenSubmitShortcut } from '@/lib/screen-submit-shortcut'
import {
  beginDartCommentSend,
  clearCompletedDartComment,
  dartCommentReadFailedNotice,
  dartCommentViewerUnknownNotice,
  dartCommentRefusedNotice,
  dartCommentUnknownNotice,
  endDartCommentSend,
  draftCommentText,
  getDartCommentSendState,
  patchDartCommentSendState,
  readDartCommentSubmission,
  reconcileDartCommentRead,
  subscribeDartCommentSendState
} from './dart-comment-send-state'
import { canSubmitDartComment, hasMatchingDartComment } from './dart-comment-duplicate'
import { clearDraft, setDraft } from './dart-draft-store'
import type { DartDetailCommentsApi } from './dart-detail-contracts'
import { DartTaskDetailNotice } from './TaskDetailNotice'
import { DartCommentDraftWarning } from './DartCommentDraftWarning'

export function DartCommentComposer({
  draftKey,
  replyTo,
  onCancelReply,
  onAddComment,
  reloadComments,
  appendLocalComment,
  readLatestComments,
  viewerName,
  viewerEmail = null
}: {
  draftKey: string
  replyTo: DartComment | null
  onCancelReply: () => void
  onAddComment: DartDetailCommentsApi['onAddComment']
  reloadComments: DartDetailCommentsApi['reloadComments']
  appendLocalComment: DartDetailCommentsApi['appendLocalComment']
  readLatestComments: () => Promise<DartComment[]>
  viewerName: string | null
  viewerEmail?: string | null
}): React.JSX.Element {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const mountedRef = useRef(true)
  const getSendState = useCallback(() => getDartCommentSendState(draftKey), [draftKey])
  const sendState = useSyncExternalStore(subscribeDartCommentSendState, getSendState, getSendState)
  const currentReplyId = useRef(replyTo?.id ?? null)
  currentReplyId.current = replyTo?.id ?? null
  const currentDraftKey = useRef(draftKey)
  currentDraftKey.current = draftKey
  const currentContext = useRef({ viewerName, viewerEmail, onAddComment, readLatestComments })
  currentContext.current = { viewerName, viewerEmail, onAddComment, readLatestComments }
  const submitting = sendState.inFlight
  const text = sendState.text ?? draftCommentText(draftKey)
  useDartCommentReplyEscape(rootRef, textareaRef, replyTo, onCancelReply, submitting)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const previousReplyId = useRef(replyTo?.id ?? null)
  useEffect(() => {
    if (replyTo) {
      textareaRef.current?.focus()
    }
    const nextReplyId = replyTo?.id ?? null
    if (previousReplyId.current !== nextReplyId) {
      patchDartCommentSendState(draftKey, { duplicate: null })
    }
    previousReplyId.current = nextReplyId
  }, [draftKey, replyTo])
  const persistDraft = useCallback(
    (next: string): void => {
      // `full` means the bounded store kept nothing: the draft state holds it, unsaved.
      if (next.trim() === '') {
        clearDraft(draftKey)
        patchDartCommentSendState(draftKey, { text: next, saved: true })
        return
      }
      const status = setDraft(draftKey, next, { dirty: true })
      patchDartCommentSendState(draftKey, { text: next, saved: status !== 'full' })
    },
    [draftKey]
  )

  const updateText = useCallback(
    (next: string): void => {
      persistDraft(next)
      patchDartCommentSendState(draftKey, { duplicate: null, refusalNotice: null })
    },
    [draftKey, persistDraft]
  )

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
              unknownSubmission: { body: text, parentId }
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

  const replyAuthor = replyTo?.author
  const canSend = hasBoundedCommentBodyText(text)
  const submitShortcutLabel = getScreenSubmitShortcutLabel()

  return (
    <div ref={rootRef} aria-busy={submitting || undefined} className="space-y-2">
      {replyAuthor ? (
        <div className="flex items-center gap-2 text-2xs text-muted-foreground">
          <span className="min-w-0 truncate">
            {translate(
              'auto.components.task.page.dart.DartCommentComposer.replyingTo',
              'Replying to {{author}}',
              { author: replyAuthor }
            )}
          </span>
          <Button
            type="button"
            disabled={sendState.inFlight}
            variant="ghost"
            size="xs"
            onClick={() => {
              if (!sendState.inFlight) {
                onCancelReply()
              }
              textareaRef.current?.focus()
            }}
          >
            {translate('auto.components.task.page.dart.DartCommentComposer.cancelReply', 'Cancel')}
          </Button>
        </div>
      ) : null}
      <DartTaskDetailNotice
        notice={sendState.refusalNotice}
        dismissNotice={() => patchDartCommentSendState(draftKey, { refusalNotice: null })}
        recheckNotice={recheck}
        actions={
          sendState.refusalNotice ? (
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={submitting}
              onClick={() =>
                void (sendState.recheckFailed ? recheck() : submit({ postAnyway: false }))
              }
            >
              {translate('auto.components.task.page.dart.DartCommentComposer.retry', 'Retry')}
            </Button>
          ) : undefined
        }
      />
      <DartTaskDetailNotice
        notice={sendState.notice}
        dismissNotice={() => patchDartCommentSendState(draftKey, { notice: null })}
        recheckNotice={recheck}
      />
      {sendState.duplicate ? (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-md border border-border/50 bg-muted/35 px-2.5 py-1.5 text-xs text-muted-foreground"
        >
          <p>
            {translate(
              'auto.components.task.page.dart.DartCommentComposer.duplicate',
              'A matching comment is already posted'
            )}
          </p>
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={submitting}
            onClick={() => void submit({ postAnyway: true })}
          >
            {translate(
              'auto.components.task.page.dart.DartCommentComposer.postAnyway',
              'Post anyway'
            )}
          </Button>
        </div>
      ) : null}
      <DartCommentDraftWarning saved={sendState.saved} onDiscard={() => persistDraft(text)} />
      <div className="flex items-end gap-2">
        <ImeTextarea
          ref={textareaRef}
          value={text}
          readOnly={submitting}
          onChange={(event) => updateText(event.target.value)}
          onKeyDown={(event) => {
            if (!isScreenSubmitShortcut(event)) {
              return
            }
            event.preventDefault()
            void submit({ postAnyway: false })
          }}
          placeholder={translate(
            'auto.components.task.page.dart.DartCommentComposer.placeholder',
            'Add a comment…'
          )}
          rows={2}
          aria-label={translate(
            'auto.components.task.page.dart.DartCommentComposer.commentLabel',
            'Comment'
          )}
          className="scrollbar-sleek min-h-[44px] w-full resize-none overflow-y-auto rounded-md border border-input bg-transparent px-2.5 py-1.5 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <Button
          type="button"
          size="icon-sm"
          className="size-8 flex-none"
          disabled={!canSend || submitting || !!sendState.duplicate}
          aria-label={translate(
            'auto.components.task.page.dart.DartCommentComposer.send',
            'Send comment'
          )}
          onClick={() => void submit({ postAnyway: false })}
        >
          {submitting ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <Send className="size-3.5" />
          )}
        </Button>
      </div>
      <p className="text-2xs text-muted-foreground">
        {translate(
          'auto.components.task.page.dart.DartCommentComposer.shortcutHint',
          '{{shortcut}} to send',
          { shortcut: submitShortcutLabel }
        )}
      </p>
    </div>
  )
}
