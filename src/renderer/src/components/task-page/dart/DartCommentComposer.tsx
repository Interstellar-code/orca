import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { LoaderCircle, Send } from 'lucide-react'
import type { DartComment } from '../../../../../shared/dart/dart-types'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { ImeTextarea } from '@/lib/ime-text-field'
import { hasBoundedCommentBodyText } from '@/lib/comment-body-submit-state'
import { isImeOwnedKeyboardEvent } from '@/lib/ime-composition-keyboard-event'
import { getScreenSubmitShortcutLabel, isScreenSubmitShortcut } from '@/lib/screen-submit-shortcut'
import { useAppStore } from '@/store'
import {
  beginDartCommentSend,
  dartCommentBlockedReason,
  dartCommentRefusedNotice,
  dartCommentUnknownNotice,
  dartDraftsFullWarning,
  dartFullDraftCopyText,
  endDartCommentSend,
  draftCommentText,
  getDartCommentSendState,
  patchDartCommentSendState,
  readDartCommentSubmission,
  subscribeDartCommentSendState
} from './dart-comment-send-state'
import { clearDraft, oldestDirtyDraft, setDraft } from './dart-draft-store'
import type { DartDetailCommentsApi } from './dart-detail-contracts'
import { DartTaskDetailNotice } from './TaskDetailNotice'

// Surfaces layered above the sheet own Escape first, exactly as the Tasks page treats them.
const ESCAPE_OWNING_OVERLAY_SELECTOR =
  '[data-slot="dropdown-menu-content"], [data-slot="popover-content"], [data-slot="select-content"], [role="menu"], [data-slot="dialog-content"], [role="alertdialog"]'

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
  const dartTaskCache = useAppStore((s) => s.dartTaskCache)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  // A write outlives its task: once this unmounts, its results belong to no screen.
  const mountedRef = useRef(true)
  const getSendState = useCallback(() => getDartCommentSendState(draftKey), [draftKey])
  const sendState = useSyncExternalStore(subscribeDartCommentSendState, getSendState, getSendState)
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

  // Radix dismisses the sheet from a capture listener that runs before the textarea's own keydown;
  // this window listener runs earlier still, so vetoing cancels the reply, not the sheet.
  useEffect(() => {
    if (!replyTo) {
      return
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        isImeOwnedKeyboardEvent(event) ||
        document.querySelector(ESCAPE_OWNING_OVERLAY_SELECTOR) !== null ||
        // Escape elsewhere in the sheet belongs to that field, not to this reply.
        !(target instanceof Node) ||
        !rootRef.current?.contains(target)
      ) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      onCancelReply()
      textareaRef.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [onCancelReply, replyTo])

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
        // Typing is the user taking responsibility for the text again.
        ...(current.blocked ? { blocked: false, reconciled: false } : {}),
        // A size notice describes text that no longer exists.
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
      if (before.inFlight || (before.blocked && !resend)) {
        return
      }
      const submission = readDartCommentSubmission(text)
      if (submission.status === 'empty') {
        return
      }
      if (submission.status === 'refused') {
        // An unresolved unknown write is the more important notice: a local refusal does not explain it.
        if (!before.blocked) {
          patchDartCommentSendState(draftKey, {
            notice: submission.notice,
            noticeIsSize: true
          })
        }
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
          ...(replyTo ? { parentId: replyTo.id } : {})
        })
        if (result.ok) {
          // Clear only the text that was sent: the box is read-only while sending.
          const latest = getDartCommentSendState(draftKey).text ?? draftCommentText(draftKey)
          const cleared = latest === sentText
          if (cleared) {
            clearDraft(draftKey)
          }
          patchDartCommentSendState(draftKey, {
            ...(cleared ? { text: null, saved: true } : {}),
            blocked: false,
            reconciled: false,
            notice: null,
            noticeIsSize: false
          })
          if (!mountedRef.current) {
            return
          }
          // A kept draft keeps its reply target, so it still answers the same parent.
          if (cleared) {
            onCancelReply()
          }
          appendLocalComment(result.comment)
          // A failed refresh reports itself in the section; it must not reject a saved comment.
          await reloadComments().catch(() => {})
          return
        }
        if (result.outcome === 'unknown') {
          patchDartCommentSendState(draftKey, {
            notice: dartCommentUnknownNotice(),
            noticeIsSize: false,
            blocked: true,
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
          // A refusal says nothing about an earlier unknown attempt, so that notice is never replaced.
          current.blocked
            ? {}
            : { notice: dartCommentRefusedNotice(result), noticeIsSize: false }
        )
      } finally {
        endDartCommentSend(draftKey)
      }
    },
    [appendLocalComment, draftKey, onAddComment, onCancelReply, reloadComments, replyTo, text]
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
  const oldest = sendState.saved ? null : oldestDirtyDraft()

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
              onCancelReply()
              textareaRef.current?.focus()
            }}
          >
            {translate('auto.components.task.page.dart.DartCommentComposer.cancelReply', 'Cancel')}
          </Button>
        </div>
      ) : null}
      <DartTaskDetailNotice
        notice={sendState.notice}
        dismissNotice={() => patchDartCommentSendState(draftKey, { notice: null })}
        recheckNotice={recheck}
        actions={
          sendState.notice?.kind === 'unknown' && sendState.reconciled ? (
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
          ) : null}
        </div>
      ) : null}
      {oldest ? (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <span className="min-w-0 break-words">
            {dartDraftsFullWarning({ dartTaskCache }, oldest)}
          </span>
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
                patchDartCommentSendState(oldest.key, { text: null, saved: true })
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
