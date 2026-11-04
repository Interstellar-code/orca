import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { LoaderCircle, Send } from 'lucide-react'
import type { DartComment } from '../../../../../shared/dart/dart-types'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { ImeTextarea } from '@/lib/ime-text-field'
import { hasBoundedCommentBodyText } from '@/lib/comment-body-submit-state'
import { useDartCommentReplyEscape } from './use-dart-comment-reply-escape'
import { getScreenSubmitShortcutLabel, isScreenSubmitShortcut } from '@/lib/screen-submit-shortcut'
import { useAppStore } from '@/store'
import {
  beginDartCommentSend,
  clearDartCommentSendState,
  dartCommentBlockedReason,
  dartCommentRefusedNotice,
  dartCommentUnknownNotice,
  dartDraftsFullWarning,
  dartFullDraftCopyText,
  endDartCommentSend,
  draftCommentText,
  getDartCommentSendState,
  patchDartCommentSendState,
  isDartCommentBodyBlocked,
  readDartCommentSubmission,
  subscribeDartCommentSendState
} from './dart-comment-send-state'
import { clearDraft, oldestDirtyDraft, setDraft } from './dart-draft-store'
import { setDartReplyTarget } from './dart-reply-target-store'
import type { DartDetailCommentsApi } from './dart-detail-contracts'
import { DartTaskDetailNotice } from './TaskDetailNotice'

export function DartCommentComposer({
  draftKey,
  replyTo,
  onCancelReply,
  onAddComment,
  reloadComments,
  appendLocalComment
}: {
  draftKey: string
  replyTo: DartComment | null
  onCancelReply: () => void
  onAddComment: DartDetailCommentsApi['onAddComment']
  reloadComments: DartDetailCommentsApi['reloadComments']
  appendLocalComment: DartDetailCommentsApi['appendLocalComment']
}): React.JSX.Element {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  useDartCommentReplyEscape(rootRef, textareaRef, draftKey, replyTo, onCancelReply)
  // A write outlives its task: once this unmounts, its results belong to no screen.
  const mountedRef = useRef(true)
  const getSendState = useCallback(() => getDartCommentSendState(draftKey), [draftKey])
  const sendState = useSyncExternalStore(subscribeDartCommentSendState, getSendState, getSendState)
  const oldest = sendState.saved ? null : oldestDirtyDraft()
  const draftsFullWarning = useAppStore((state) =>
    oldest ? dartDraftsFullWarning(state, oldest) : null
  )
  const submitting = sendState.inFlight
  const text = sendState.text ?? draftCommentText(draftKey)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (replyTo) {
      textareaRef.current?.focus()
    }
  }, [replyTo])

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
      patchDartCommentSendState(draftKey, (current) => ({
        blocked: isDartCommentBodyBlocked(draftKey, next),
        refusalNotice: null,
        ...(current.noticeIsSize && readDartCommentSubmission(next).status !== 'refused'
          ? { notice: null, noticeIsSize: false }
          : {})
      }))
    },
    [draftKey, persistDraft]
  )

  const submit = useCallback(
    async ({ resend }: { resend: boolean }): Promise<void> => {
      const before = getDartCommentSendState(draftKey)
      if (before.inFlight || (before.blocked && (!resend || !before.reconciled))) {
        return
      }
      const submission = readDartCommentSubmission(text)
      if (submission.status === 'empty') {
        return
      }
      if (submission.status === 'refused') {
        patchDartCommentSendState(draftKey, {
          refusalNotice: submission.notice
        })
        return
      }
      // Claimed synchronously, so a shortcut and a click in one tick cannot both send.
      if (!beginDartCommentSend(draftKey)) {
        return
      }
      const sentText = text
      try {
        const result = await onAddComment({
          text: submission.body,
          ...((resend ? before.uncertainParentId : replyTo?.id)
            ? { parentId: (resend ? before.uncertainParentId : replyTo?.id)! }
            : {})
        })
        if (getDartCommentSendState(draftKey).generation !== before.generation) {
          return
        }
        if (result.ok) {
          // Clear only the text that was sent: the box is read-only while sending.
          const latest = getDartCommentSendState(draftKey).text ?? draftCommentText(draftKey)
          const cleared = latest === sentText
          if (cleared) {
            clearDraft(draftKey)
          }
          const uncertainBodies = new Set(before.uncertainBodies)
          uncertainBodies.delete(submission.body)
          patchDartCommentSendState(draftKey, {
            ...(cleared ? { text: null, saved: true } : {}),
            blocked: false,
            uncertainBodies,
            refusalNotice: null,
            ...(uncertainBodies.size === 0 ? { notice: null, noticeIsSize: false } : {})
          })
          if (cleared) {
            setDartReplyTarget(draftKey, null)
          }
          appendLocalComment(result.comment)
          // Refresh the original task even if its composer has unmounted.
          await reloadComments().catch(() => {})
          return
        }
        if (result.outcome === 'unknown') {
          patchDartCommentSendState(draftKey, {
            notice: dartCommentUnknownNotice(),
            noticeIsSize: false,
            blocked: true,
            uncertainBodies: new Set([...before.uncertainBodies, submission.body]),
            uncertainParentId: resend ? before.uncertainParentId : (replyTo?.id ?? null),
            refusalNotice: null,
            reconciled: false
          })
          if (!mountedRef.current) {
            return
          }
          // The write may have landed: read the list, but never resend the same text on its own.
          try {
            await reloadComments()
          } catch {
            // A failed read is not evidence, so the notice stays unconfirmed and Send stays blocked.
            return
          }
          patchDartCommentSendState(draftKey, (current) => ({
            ...(current.blocked ? { reconciled: true } : {}),
            ...(current.notice?.kind === 'unknown'
              ? { notice: { ...current.notice, checkedAt: Date.now() } }
              : {})
          }))
          return
        }
        patchDartCommentSendState(draftKey, (current) =>
          current.uncertainBodies.size > 0
            ? { refusalNotice: dartCommentRefusedNotice(result) }
            : { notice: dartCommentRefusedNotice(result), noticeIsSize: false }
        )
      } finally {
        endDartCommentSend(draftKey)
      }
    },
    [appendLocalComment, draftKey, onAddComment, reloadComments, replyTo, text]
  )

  const recheck = useCallback(async (): Promise<void> => {
    try {
      await reloadComments()
    } catch {
      // A failed or unconfirmed read proves nothing: no "Last checked" and no Send again.
      return
    }
    patchDartCommentSendState(draftKey, (current) => ({
      ...(current.blocked ? { reconciled: true } : {}),
      ...(current.notice?.kind === 'unknown'
        ? { notice: { ...current.notice, checkedAt: Date.now() } }
        : {})
    }))
  }, [draftKey, reloadComments])

  const canSend = hasBoundedCommentBodyText(text)
  const submitShortcutLabel = getScreenSubmitShortcutLabel()

  return (
    <div ref={rootRef} aria-busy={submitting || undefined} className="space-y-2">
      {replyTo ? (
        <div className="flex items-center gap-2 text-2xs text-muted-foreground">
          <span className="min-w-0 truncate">
            {translate(
              'auto.components.task.page.dart.DartCommentComposer.replyingTo',
              'Replying to {{author}}',
              { author: replyTo.author }
            )}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => {
              if (!sendState.blocked) {
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
      />
      <DartTaskDetailNotice
        notice={sendState.notice}
        dismissNotice={() => patchDartCommentSendState(draftKey, { notice: null })}
        recheckNotice={recheck}
        actions={
          sendState.notice?.kind === 'unknown' && sendState.blocked && sendState.reconciled ? (
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={submitting}
              onClick={() => void submit({ resend: true })}
            >
              {translate(
                'auto.components.task.page.dart.DartCommentComposer.sendAgain',
                'Send again'
              )}
            </Button>
          ) : undefined
        }
      />
      {sendState.blocked && !sendState.notice ? (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-md border border-border/50 bg-muted/35 px-2.5 py-1.5 text-xs text-muted-foreground"
        >
          <p className="min-w-0 break-words">{dartCommentBlockedReason()}</p>
          {sendState.reconciled ? (
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={submitting}
              onClick={() => void submit({ resend: true })}
            >
              {translate(
                'auto.components.task.page.dart.DartCommentComposer.sendAgain',
                'Send again'
              )}
            </Button>
          ) : (
            <Button type="button" variant="outline" size="xs" onClick={() => void recheck()}>
              {translate(
                'auto.components.task.page.dart.DartCommentComposer.checkAgain',
                'Check again'
              )}
            </Button>
          )}
        </div>
      ) : null}
      {oldest ? (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <span className="min-w-0 break-words">{draftsFullWarning}</span>
          <span className="flex flex-none gap-1">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => {
                void window.api.ui?.writeClipboardText(dartFullDraftCopyText(oldest))
              }}
            >
              {translate('auto.components.task.page.dart.DartCommentComposer.copyOldest', 'Copy')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => {
                clearDraft(oldest.key)
                // That draft's own state must not resurrect text the store no longer has.
                clearDartCommentSendState(oldest.key)
                setDartReplyTarget(oldest.key, null)
                persistDraft(text)
              }}
            >
              {translate(
                'auto.components.task.page.dart.DartCommentComposer.discardOldest',
                'Discard it'
              )}
            </Button>
          </span>
        </div>
      ) : null}
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
            void submit({ resend: false })
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
          disabled={!canSend || submitting || sendState.blocked}
          aria-label={translate(
            'auto.components.task.page.dart.DartCommentComposer.send',
            'Send comment'
          )}
          onClick={() => void submit({ resend: false })}
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
