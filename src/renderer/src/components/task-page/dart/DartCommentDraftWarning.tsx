import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { dartDraftsFullWarning } from './dart-comment-send-state'
import {
  dartFullDraftTarget,
  discardDartDraft,
  type DartFullDraftTarget
} from './dart-draft-eviction'
import { draftValueText } from './dart-draft-store'

/** The drafts-full warning every editor shows (comment, description, New task): same text, Copy and Discard it. */
export function DartDraftsFullAlert({
  target,
  onDiscard
}: {
  target: DartFullDraftTarget
  onDiscard: () => void
}): React.JSX.Element {
  const warning = useAppStore((state) => dartDraftsFullWarning(state, target))
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
          onClick={() => void window.api.ui?.writeClipboardText(draftValueText(target.value))}
        >
          {translate('auto.components.task.page.dart.DartCommentComposer.copyOldest', 'Copy')}
        </Button>
        {target.discardable ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => {
              if (discardDartDraft(target.key)) {
                onDiscard()
              }
            }}
          >
            {translate(
              'auto.components.task.page.dart.DartCommentComposer.discardOldest',
              'Discard it'
            )}
          </Button>
        ) : null}
      </span>
    </div>
  )
}

export function DartCommentDraftWarning({
  saved,
  onDiscard
}: {
  saved: boolean
  onDiscard: () => void
}): React.JSX.Element | null {
  const target = saved ? null : dartFullDraftTarget()
  return target ? <DartDraftsFullAlert target={target} onDiscard={onDiscard} /> : null
}
