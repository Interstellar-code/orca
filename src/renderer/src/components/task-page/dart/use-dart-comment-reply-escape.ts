import { useEffect, type RefObject } from 'react'
import type { DartComment } from '../../../../../shared/dart/dart-types'
import { isImeOwnedKeyboardEvent } from '@/lib/ime-composition-keyboard-event'
import { getDartCommentSendState } from './dart-comment-send-state'

// Surfaces layered above the sheet own Escape first, exactly as the Tasks page treats them.
const ESCAPE_OWNING_OVERLAY_SELECTOR =
  '[data-slot="dropdown-menu-content"], [data-slot="popover-content"], [data-slot="select-content"], [role="menu"], [data-slot="dialog-content"], [role="alertdialog"]'

export function useDartCommentReplyEscape(
  rootRef: RefObject<HTMLDivElement | null>,
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  draftKey: string,
  replyTo: DartComment | null,
  onCancelReply: () => void
): void {
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
      if (getDartCommentSendState(draftKey).uncertainBodies.size === 0) {
        onCancelReply()
      }
      textareaRef.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [draftKey, onCancelReply, replyTo, rootRef, textareaRef])
}
