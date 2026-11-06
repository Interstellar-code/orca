import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { ImeTextarea } from '@/lib/ime-text-field'
import { dartTextTooLargeMessage } from '@/runtime/runtime-dart-write-client'
import { checkDartRequestText } from '../../../../../shared/dart/dart-text-limits'
import {
  blockedFieldHint,
  DartPendingSlot,
  useDartBlockedHint,
  type DartFieldState
} from './DartPropertyChips'

/** Blur or Enter saves (Enter keeps focus), Escape puts the saved title back. */
export function DartTitleField({
  title,
  state,
  onSave
}: {
  title: string
  state: DartFieldState
  onSave: (title: string) => void
}): React.JSX.Element {
  const [typed, setTyped] = useState<{ text: string; source: string } | null>(null)
  // An untouched draft follows Dart's title; an edited one is kept, and the user is told Dart moved on.
  const draft = typed && !(typed.source !== title && typed.text === typed.source) ? typed : null
  const serverChanged = draft !== null && draft.source !== title && draft.text !== title
  const { describedBy, hint } = useDartBlockedHint(state.blocked)
  const reverting = useRef(false)
  const commit = (): void => {
    if (reverting.current) {
      reverting.current = false
      return
    }
    if (draft === null || state.disabled) {
      return
    }
    const next = draft.text.replace(/\s*[\r\n]+\s*/g, ' ').trim()
    if (next === title) {
      setTyped(null)
      return
    }
    if (!next) {
      setTyped(null)
      toast.error(
        translate('auto.components.task.page.dart.DartTitleField.required', 'Title is required')
      )
      return
    }
    const check = checkDartRequestText('title', next)
    // An over-long title stays in the field so the user can shorten it.
    if (!check.ok) {
      toast.error(
        dartTextTooLargeMessage({ amount: check.size, limit: check.limit, unit: check.unit })
      )
      return
    }
    setTyped(null)
    onSave(next)
  }
  return (
    <div
      className={cn(
        'flex flex-wrap items-start gap-1.5',
        state.disabled && 'cursor-not-allowed opacity-60 [&_textarea]:pointer-events-none'
      )}
      title={state.blocked ? blockedFieldHint() : undefined}
    >
      {hint}
      <ImeTextarea
        rows={1}
        value={draft?.text ?? title}
        readOnly={state.disabled}
        aria-disabled={state.disabled || undefined}
        aria-describedby={describedBy}
        data-dart-escape-local
        aria-label={translate('auto.components.task.page.dart.DartTitleField.label', 'Title')}
        onChange={(event) =>
          !state.disabled && setTyped({ text: event.target.value, source: draft?.source ?? title })
        }
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            reverting.current = true
            setTyped(null)
            event.currentTarget.blur()
          }
        }}
        className="block min-w-0 flex-1 resize-none overflow-hidden rounded-md border border-transparent bg-transparent px-0 py-0 text-xl font-semibold leading-tight text-foreground outline-none transition [field-sizing:content] hover:border-border/50 hover:bg-accent/40 focus-visible:border-border focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-ring read-only:opacity-80"
      />
      {serverChanged ? (
        <p role="status" className="order-last w-full text-2xs text-muted-foreground">
          {translate(
            'auto.components.task.page.dart.DartTitleField.changedInDart',
            'The title changed in Dart. Saving replaces it with yours.'
          )}
        </p>
      ) : null}
      <span className="mt-1.5">
        <DartPendingSlot pending={state.pending} />
      </span>
    </div>
  )
}
