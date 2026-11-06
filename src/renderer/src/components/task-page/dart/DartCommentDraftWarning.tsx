import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import {
  dartDraftsFullWarning,
  dartFullDraftCopyText,
  clearDartCommentSendState
} from './dart-comment-send-state'
import { clearDraft, oldestDirtyDraft } from './dart-draft-store'
import { setDartReplyTarget } from './dart-reply-target-store'

export function DartCommentDraftWarning({
  saved,
  onDiscard
}: {
  saved: boolean
  onDiscard: () => void
}): React.JSX.Element | null {
  const oldest = saved ? null : oldestDirtyDraft()
  const warning = useAppStore((state) => (oldest ? dartDraftsFullWarning(state, oldest) : null))
  if (!oldest) {
    return null
  }
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
    >
      <span className="min-w-0 break-words">{warning}</span>
      <span className="flex flex-none gap-1">
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() => void window.api.ui?.writeClipboardText(dartFullDraftCopyText(oldest))}
        >
          {translate('auto.components.task.page.dart.DartCommentComposer.copyOldest', 'Copy')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => {
            clearDraft(oldest.key)
            clearDartCommentSendState(oldest.key)
            setDartReplyTarget(oldest.key, null)
            onDiscard()
          }}
        >
          {translate(
            'auto.components.task.page.dart.DartCommentComposer.discardOldest',
            'Discard it'
          )}
        </Button>
      </span>
    </div>
  )
}
