import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { ImeTextarea } from '@/lib/ime-text-field'
import { dartTextTooLargeMessage } from '@/runtime/runtime-dart-write-client'
import { checkDartRequestText } from '../../../../../shared/dart/dart-text-limits'
import { blockedFieldHint, DartPendingSlot, type DartFieldState } from './DartPropertyChips'

/** Blur or Enter saves, Escape puts the saved title back. */
export function DartTitleField({
  title,
  state,
  onSave
}: {
  title: string
  state: DartFieldState
  onSave: (title: string) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState<string | null>(null)
  const reverting = useRef(false)
  const commit = (): void => {
    if (reverting.current) {
      reverting.current = false
      return
    }
    if (draft === null) {
      return
    }
    setDraft(null)
    const next = draft.trim()
    if (next === title) {
      return
    }
    if (!next) {
      toast.error(
        translate('auto.components.task.page.dart.DartTitleField.required', 'Title is required')
      )
      return
    }
    const check = checkDartRequestText('title', next)
    if (!check.ok) {
      toast.error(
        dartTextTooLargeMessage({ amount: check.size, limit: check.limit, unit: check.unit })
      )
      return
    }
    onSave(next)
  }
  return (
    <div
      className="flex items-start gap-1.5"
      title={state.blocked ? blockedFieldHint() : undefined}
    >
      <ImeTextarea
        rows={1}
        value={draft ?? title}
        disabled={state.disabled}
        aria-label={translate('auto.components.task.page.dart.DartTitleField.label', 'Title')}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            event.currentTarget.blur()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            reverting.current = true
            setDraft(null)
            event.currentTarget.blur()
          }
        }}
        className="block min-w-0 flex-1 resize-none overflow-hidden rounded-md border border-transparent bg-transparent px-1 py-0 text-xl font-semibold leading-tight text-foreground outline-none transition [field-sizing:content] hover:border-border/50 hover:bg-accent/40 focus-visible:border-border focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-80"
      />
      <span className="mt-1.5">
        <DartPendingSlot pending={state.pending} />
      </span>
    </div>
  )
}
