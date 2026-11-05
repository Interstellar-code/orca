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
  dartUncertainReplyTarget,
  claimDartLandedCommentReload,
  forgetDartCommentBody,
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
import { DartCommentUncertainActions } from './DartCommentUncertainActions'
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
  useDartCommentReplyEscape(
    rootRef,
    textareaRef,
    replyTo,
    onCancelReply,
    !sendState.inFlight && !isDartCommentBodyBlocked(draftKey, text)
  )
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
  useEffect(() => {
    if (sendState.inFlight || sendState.landedComments.length === 0) {
      return
    }
    for (const comment of sendState.landedComments) {
      appendLocalComment(comment)
    }
    if (claimDartLandedCommentReload(draftKey)) {
      void reloadComments().catch(() => {})
    }
  }, [appendLocalComment, draftKey, reloadComments, sendState.inFlight, sendState.landedComments])

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
      patchDartCommentSendState(draftKey, {
        blocked: isDartCommentBodyBlocked(draftKey, next),
        refusalNotice: null
      })
    },
    [draftKey, persistDraft]
  )

  const submit = useCallback(
    async ({ resend }: { resend: boolean }): Promise<void> => {
      const before = getDartCommentSendState(draftKey)
      const blocked = isDartCommentBodyBlocked(draftKey, text)
      if (before.inFlight || (blocked ? !resend || !before.reconciled : resend)) {
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
      if (!beginDartCommentSend(draftKey)) {
        return
      }
      const sentText = text
      const originalTarget = dartUncertainReplyTarget(draftKey, submission.body)
      const target = resend ? originalTarget : replyTo
      try {
        const result = await onAddComment({
          text: submission.body,
          ...(target ? { parentId: target.id } : {})
        })
        const current = getDartCommentSendState(draftKey)
        const uncertainBodies = new Map(current.uncertainBodies)
        if (result.ok) {
          for (const body of uncertainBodies.keys()) {
            if (body.trim() === submission.body.trim()) {
              uncertainBodies.delete(body)
            }
          }
          patchDartCommentSendState(draftKey, {
            landedComments: [...current.landedComments, result.comment],
            uncertainBodies,
            blocked: [...uncertainBodies.keys()].some(
              (body) => body.trim() === (current.text ?? draftCommentText(draftKey)).trim()
            ),
            ...(uncertainBodies.size === 0 ? { notice: null, reconciled: false } : {})
          })
          if (
            (current.text ?? draftCommentText(draftKey)) === sentText &&
            current.generation === before.generation
          ) {
            clearDraft(draftKey)
            patchDartCommentSendState(draftKey, { text: null, saved: true, refusalNotice: null })
            setDartReplyTarget(draftKey, null)
          }
          if (mountedRef.current && claimDartLandedCommentReload(draftKey)) {
            await reloadComments().catch(() => {})
          }
          return
        }
        if (result.outcome === 'unknown') {
          uncertainBodies.set(
            submission.body,
            resend
              ? (originalTarget ?? null)
              : replyTo
                ? { id: replyTo.id, author: replyTo.author }
                : null
          )
          patchDartCommentSendState(draftKey, {
            uncertainBodies,
            blocked: (current.text ?? draftCommentText(draftKey)).trim() === submission.body.trim(),
            notice: dartCommentUnknownNotice(),
            reconciled: false
          })
          if (!mountedRef.current) {
            return
          }
          try {
            await reloadComments()
          } catch {
            return
          }
          patchDartCommentSendState(draftKey, (latest) => ({
            ...(latest.uncertainBodies.size > 0 ? { reconciled: true } : {}),
            ...(latest.notice?.kind === 'unknown'
              ? { notice: { ...latest.notice, checkedAt: Date.now() } }
              : {})
          }))
          return
        }
        patchDartCommentSendState(draftKey, { refusalNotice: dartCommentRefusedNotice(result) })
      } finally {
        endDartCommentSend(draftKey)
      }
    },
    [draftKey, onAddComment, reloadComments, replyTo, text]
  )

  const recheck = useCallback(async (): Promise<void> => {
    try {
      await reloadComments()
    } catch {
      // A failed or unconfirmed read proves nothing: no "Last checked" and no Send again.
      return
    }
    patchDartCommentSendState(draftKey, (current) => ({
      ...(current.uncertainBodies.size > 0 ? { reconciled: true } : {}),
      ...(current.notice?.kind === 'unknown'
        ? { notice: { ...current.notice, checkedAt: Date.now() } }
        : {})
    }))
  }, [draftKey, reloadComments])

  const resendTarget = dartUncertainReplyTarget(draftKey, text)
  const replyAuthor = resendTarget === undefined ? replyTo?.author : resendTarget?.author
  const cancelReplyBlocked = isDartCommentBodyBlocked(draftKey, text)
  const canResendCurrentBody = cancelReplyBlocked
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
            disabled={cancelReplyBlocked || sendState.inFlight}
            variant="ghost"
            size="xs"
            onClick={() => {
              if (!cancelReplyBlocked && !sendState.inFlight) {
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
          sendState.notice?.kind === 'unknown' && sendState.blocked && canResendCurrentBody ? (
            <DartCommentUncertainActions
              reconciled={sendState.reconciled}
              submitting={submitting}
              onResend={() => void submit({ resend: true })}
              onPosted={() => forgetDartCommentBody(draftKey, text)}
            />
          ) : undefined
        }
      />
      {sendState.blocked && !sendState.notice ? (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-md border border-border/50 bg-muted/35 px-2.5 py-1.5 text-xs text-muted-foreground"
        >
          <p className="min-w-0 break-words">{dartCommentBlockedReason()}</p>
          {sendState.reconciled && canResendCurrentBody ? (
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
