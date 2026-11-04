import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { ImeInput } from '@/lib/ime-text-field'
import { getIntlLocale } from '@/i18n/i18n'
import { dartCalendarDate, formatDartDate, isFinishedDateInput } from './dart-date-format'
import { DartChipRow, type DartFieldState } from './DartPropertyChips'

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
  if (!editable) {
    return <span>{formatDartDate(value, getIntlLocale()) ?? '—'}</span>
  }
  return (
    <DartChipRow state={state}>
      <ImeInput
        type="date"
        aria-label={label}
        value={date ?? ''}
        disabled={state.disabled}
        onChange={(event) => {
          const next = event.target.value
          if (next === '') {
            return
          }
          if (isFinishedDateInput(next) && next !== date) {
            onChange(next)
          }
        }}
        className="h-6 min-w-0 rounded-md border border-border/70 bg-background/70 px-1.5 text-2xs text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-80"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className={date ? undefined : 'invisible'}
        disabled={state.disabled || !date}
        aria-label={translate(
          'auto.components.task.page.dart.DartDateField.clear',
          'Clear {{label}}',
          { label }
        )}
        onClick={() => onChange(null)}
      >
        <X className="size-3" />
      </Button>
    </DartChipRow>
  )
}
