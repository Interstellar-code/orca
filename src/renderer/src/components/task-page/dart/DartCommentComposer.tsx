import { useCallback, useEffect, useRef, useState } from 'react'
import { LoaderCircle, Send } from 'lucide-react'
import type { DartComment } from '../../../../../shared/dart/dart-types'
import { checkDartRequestText } from '../../../../../shared/dart/dart-text-limits'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { ImeTextarea } from '@/lib/ime-text-field'
import {
  getCommentBodySubmitState,
  hasBoundedCommentBodyText
} from '@/lib/comment-body-submit-state'
import { isImeOwnedKeyboardEvent } from '@/lib/ime-composition-keyboard-event'
import { getScreenSubmitShortcutLabel, isScreenSubmitShortcut } from '@/lib/screen-submit-shortcut'
import { taskProviderErrorMessage } from '@/lib/task-provider-error-copy'
import { dartTextTooLargeMessage } from '@/runtime/runtime-dart-write-client'
import {
  clearDraft,
  dartDraftKeyParts,
  getDraft,
  oldestDirtyDraft,
  setDraft,
  type DartDraftValue
} from './dart-draft-store'
import type { DartDetailCommentsApi, DartWriteNotice } from './dart-detail-contracts'
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
  const [text, setText] = useState(() => {
    const stored = getDraft(draftKey)
    return typeof stored === 'string' ? stored : ''
  })
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState<DartWriteNotice | null>(null)
  // An unknown outcome blocks Send until the user edits the text or sends again on purpose.
  const [sendBlocked, setSendBlocked] = useState(false)
  const [reconciled, setReconciled] = useState(false)
  const [fullDraft, setFullDraft] = useState<{ key: string; value: DartDraftValue } | null>(null)
  const submittingRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  // A write can outlive the task it was typed on; its result must not overwrite the next draft.
  const draftKeyRef = useRef(draftKey)

  useEffect(() => {
    if (replyTo) {
      textareaRef.current?.focus()
    }
  }, [replyTo])

  // Radix dismisses the sheet from a document capture listener, which runs before the textarea's
  // own keydown. Window capture runs earlier still, so vetoing there cancels the reply rather
  // than closing the sheet.
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
      if (next.trim() === '') {
        clearDraft(draftKey)
        setFullDraft(null)
        return
      }
      const status = setDraft(draftKey, next, { dirty: true })
      setFullDraft(status === 'full' ? oldestDirtyDraft() : null)
    },
    [draftKey]
  )

  const updateText = useCallback(
    (next: string): void => {
      setText(next)
      // Typing is the user taking responsibility for the text again.
      setSendBlocked(false)
      persistDraft(next)
    },
    [persistDraft]
  )

  const submit = useCallback(
    async (options: { resend: boolean }): Promise<void> => {
      if (submittingRef.current || (sendBlocked && !options.resend)) {
        return
      }
      const bodyState = getCommentBodySubmitState(text)
      if (bodyState.status === 'empty') {
        return
      }
      if (bodyState.status === 'too-large-leading-whitespace') {
        setNotice({
          kind: 'refused',
          message: translate(
            'auto.components.task.page.dart.DartCommentComposer.commentTooLarge',
            'This comment is too long to send to Dart. Shorten it and try again.'
          )
        })
        return
      }
      const size = checkDartRequestText('comment', bodyState.body)
      if (!size.ok) {
        setNotice({
          kind: 'refused',
          message: dartTextTooLargeMessage({
            amount: size.size,
            limit: size.limit,
            unit: size.unit
          })
        })
        return
      }
      submittingRef.current = true
      setSubmitting(true)
      try {
        const result = await onAddComment({
          text: bodyState.body,
          ...(replyTo ? { parentId: replyTo.id } : {})
        })
        // A task switch mid-write means these results belong to a draft no longer on screen.
        const current = draftKeyRef.current === draftKey
        if (result.ok) {
          appendLocalComment(result.comment)
          clearDraft(draftKey)
          if (current) {
            setText('')
            setNotice(null)
            setFullDraft(null)
            setSendBlocked(false)
            setReconciled(false)
            onCancelReply()
          }
          // The list read reports its own failure in the section; a failed refresh must not
          // turn a saved comment into an unhandled rejection.
          await reloadComments().catch(() => {})
          return
        }
        if (result.outcome === 'unknown') {
          if (current) {
            // The write may have landed: read the list, but never resend the same text on its own.
            setNotice({
              kind: 'unknown',
              message: translate(
                'auto.components.task.page.dart.DartCommentComposer.mayHavePosted',
                'Dart may have posted this comment. Check the list before sending again'
              )
            })
            setSendBlocked(true)
            setReconciled(false)
          }
          await reloadComments().catch(() => {})
          if (current) {
            setReconciled(true)
            setNotice((shown) =>
              shown?.kind === 'unknown' ? { ...shown, checkedAt: Date.now() } : shown
            )
          }
          return
        }
        if (current) {
          // A refusal proves nothing landed, so Send works again and the draft stays as it was.
          setSendBlocked(false)
          setNotice({
            kind: 'refused',
            message: translate(
              'auto.components.task.page.dart.DartCommentComposer.notSaved',
              "Comment wasn't saved: {{message}}",
              { message: taskProviderErrorMessage(result) }
            )
          })
        }
      } finally {
        submittingRef.current = false
        setSubmitting(false)
      }
    },
    [
      appendLocalComment,
      draftKey,
      onAddComment,
      onCancelReply,
      reloadComments,
      replyTo,
      sendBlocked,
      text
    ]
  )

  const recheck = useCallback(async (): Promise<void> => {
    await reloadComments().catch(() => {})
    setReconciled(true)
    setNotice((current) =>
      current?.kind === 'unknown' ? { ...current, checkedAt: Date.now() } : current
    )
  }, [reloadComments])

  const canSend = hasBoundedCommentBodyText(text)
  const submitShortcutLabel = getScreenSubmitShortcutLabel()
  const oldest = fullDraft ? dartDraftKeyParts(fullDraft.key) : null

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
        notice={notice}
        dismissNotice={() => setNotice(null)}
        recheckNotice={recheck}
        actions={
          notice?.kind === 'unknown' && reconciled ? (
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
      {fullDraft && oldest ? (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <span className="min-w-0 break-words">
            {translate(
              'auto.components.task.page.dart.DartCommentComposer.draftsFull',
              'Orca keeps a bounded number of unsaved Dart drafts. The oldest ({{kind}} on {{host}}, task {{task}}) has to be copied or discarded first.',
              { kind: oldest.kind, host: oldest.hostKey, task: oldest.taskId }
            )}
          </span>
          <span className="flex flex-none gap-1">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => {
                const { value } = fullDraft
                void window.api.ui?.writeClipboardText(
                  typeof value === 'string' ? value : value.draft
                )
              }}
            >
              {translate('auto.components.task.page.dart.DartCommentComposer.copyOldest', 'Copy')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => {
                clearDraft(fullDraft.key)
                setFullDraft(null)
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
          disabled={!canSend || submitting || sendBlocked}
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
