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
  draftCommentText,
  getDartCommentSendState,
  patchDartCommentSendState,
  subscribeDartCommentSendState
} from './dart-comment-send-state'
import { clearDraft, setDraft } from './dart-draft-store'
import type { DartDetailCommentsApi } from './dart-detail-contracts'
import { DartTaskDetailNotice } from './TaskDetailNotice'
import { DartCommentDraftWarning } from './DartCommentDraftWarning'
import { useDartCommentSubmission } from './use-dart-comment-submission'

export function DartCommentComposer({
  draftKey,
  replyTo,
  onCancelReply,
  onAddComment,
  reloadComments,
  appendLocalComment,
  readLatestComments,
  viewerName,
  onRetry,
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
  onRetry?: () => void
  viewerEmail?: string | null
}): React.JSX.Element {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const getSendState = useCallback(() => getDartCommentSendState(draftKey), [draftKey])
  const sendState = useSyncExternalStore(subscribeDartCommentSendState, getSendState, getSendState)
  const submitting = sendState.inFlight
  const text = sendState.text ?? draftCommentText(draftKey)
  useDartCommentReplyEscape(rootRef, textareaRef, replyTo, onCancelReply, submitting)

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
  const { submit, recheck } = useDartCommentSubmission({
    draftKey,
    replyTo,
    text,
    onAddComment,
    reloadComments,
    appendLocalComment,
    readLatestComments,
    viewerName,
    viewerEmail
  })

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
              onClick={() => {
                if (sendState.recheckFailed) {
                  void recheck()
                } else if (!viewerName?.trim() && !viewerEmail?.trim()) {
                  onRetry?.()
                } else {
                  void submit({ postAnyway: false })
                }
              }}
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
