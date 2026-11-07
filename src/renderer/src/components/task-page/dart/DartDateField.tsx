import { useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ImeInput } from '@/lib/ime-text-field'
import { getIntlLocale, translate } from '@/i18n/i18n'
import { dartCalendarDate, formatDartDate, isFinishedDateInput } from './dart-date-format'
import { DartChipRow, useDartBlockedHint, type DartFieldState } from './DartPropertyChips'

/** Read-only text when the host cannot take date-only values (`editable` false). */
export function DartDateField({
  label,
  value,
  editable,
  state,
  onChange
}: {
  label: string
  value: string | null | undefined
  editable: boolean
  state: DartFieldState
  onChange: (value: string | null) => void
}): React.JSX.Element {
  const date = dartCalendarDate(value)
  const [draft, setDraft] = useState<string | null>(null)
  const reverting = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  const { describedBy, hint } = useDartBlockedHint(state.blocked)
  if (!editable) {
    return <span>{formatDartDate(value, getIntlLocale()) ?? '—'}</span>
  }
  // A date input reports '' while only part of it is typed (`badInput`), so that is not a clear.
  const commit = (partial: boolean): void => {
    if (reverting.current) {
      reverting.current = false
      return
    }
    if (draft === null || state.disabled) {
      return
    }
    setDraft(null)
    if (draft === '' && !partial && date) {
      onChange(null)
    } else if (isFinishedDateInput(draft) && draft !== date) {
      onChange(draft)
    }
  }
  return (
    <DartChipRow state={state}>
      {hint}
      <ImeInput
        ref={input}
        type="date"
        aria-label={label}
        aria-describedby={describedBy}
        value={draft ?? date ?? ''}
        readOnly={state.disabled}
        aria-disabled={state.disabled || undefined}
        data-dart-escape-local
        onChange={(event) => !state.disabled && setDraft(event.target.value)}
        onBlur={(event) => commit(event.currentTarget.validity.badInput)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit(event.currentTarget.validity.badInput)
          } else if (event.key === 'Escape') {
            event.preventDefault()
            reverting.current = true
            setDraft(null)
            event.currentTarget.blur()
          }
        }}
        className="h-6 min-w-0 rounded-md border border-border/70 bg-background/70 px-1.5 text-2xs text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 read-only:opacity-80"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className={date ? undefined : 'invisible'}
        disabled={!date}
        aria-disabled={state.disabled || undefined}
        // Keeps the input focused, so pressing Clear does not blur and commit a draft first.
        onMouseDown={(event) => event.preventDefault()}
        aria-label={translate(
          'auto.components.task.page.dart.DartDateField.clear',
          'Clear {{label}}',
          { label }
        )}
        onClick={() => {
          if (state.disabled) {
            return
          }
          setDraft(null)
          input.current?.focus()
          onChange(null)
        }}
      >
        <X className="size-3" />
      </Button>
    </DartChipRow>
  )
}
