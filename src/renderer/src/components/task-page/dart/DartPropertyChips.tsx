import { useState } from 'react'
import { Check, ChevronDown, LoaderCircle } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from '@/components/ui/command'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { LINEAR_EDIT_CHIP_CLASS } from '@/components/linear-item-drawer-edit-controls'
import { translate } from '@/i18n/i18n'

const NONE_VALUE = '__dart-none__'

export type DartFieldState = { pending: boolean; blocked: boolean; disabled: boolean }

export function dartFieldState(
  field: string,
  pendingFields: ReadonlySet<string>,
  blockedFields: ReadonlySet<string>
): DartFieldState {
  const pending = pendingFields.has(field)
  const blocked = blockedFields.has(field)
  return { pending, blocked, disabled: pending || blocked }
}

export function blockedFieldHint(): string {
  return translate(
    'auto.components.task.page.dart.DartPropertyChips.blockedHint',
    'Dart may have applied a change to this field. Check the notice above first.'
  )
}

/** The slot is always laid out, so a pending save never shifts the row. */
export function DartPendingSlot({ pending }: { pending: boolean }): React.JSX.Element {
  return (
    <span className="flex size-3 flex-none items-center justify-center" aria-hidden>
      {pending ? <LoaderCircle className="size-3 animate-spin opacity-70" /> : null}
    </span>
  )
}

export function DartChipRow({
  state,
  children
}: {
  state: DartFieldState
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div
      className="flex min-w-0 items-center gap-1.5"
      title={state.blocked ? blockedFieldHint() : undefined}
    >
      {children}
      <DartPendingSlot pending={state.pending} />
    </div>
  )
}

/** Status, priority and size: `value` null is the "None" entry, which only fields that can be cleared offer. */
export function DartSelectChip({
  label,
  value,
  options,
  noneLabel,
  state,
  disabled,
  toneClass,
  onChange
}: {
  label: string
  value: string | null
  options: readonly string[]
  noneLabel?: string
  state: DartFieldState
  disabled?: boolean
  toneClass?: string
  onChange: (value: string | null) => void
}): React.JSX.Element {
  // An applied value missing from the config stays selectable.
  const choices = value && !options.includes(value) ? [value, ...options] : options
  return (
    <DartChipRow state={state}>
      <Select
        value={value ?? NONE_VALUE}
        onValueChange={(next) => onChange(next === NONE_VALUE ? null : next)}
        disabled={state.disabled || disabled}
      >
        <SelectTrigger size="sm" density="compact" aria-label={label}>
          <SelectValue>
            <span className={toneClass}>{value ?? noneLabel ?? '—'}</span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {noneLabel ? <SelectItem value={NONE_VALUE}>{noneLabel}</SelectItem> : null}
          {choices.map((choice) => (
            <SelectItem key={choice} value={choice}>
              {choice}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </DartChipRow>
  )
}

export type DartPickerExtra = { key: string; label: string; onSelect: () => void }

/** Assignee and dartboard: one searchable choice; `clearLabel` adds the entry that sends null. */
export function DartSearchChip({
  label,
  valueLabel,
  options,
  selected,
  clearLabel,
  extras,
  state,
  disabled,
  searchPlaceholder,
  emptyLabel,
  onPick
}: {
  label: string
  valueLabel: string
  options: readonly string[]
  selected: string | null
  clearLabel?: string
  extras?: readonly DartPickerExtra[]
  state: DartFieldState
  disabled?: boolean
  searchPlaceholder: string
  emptyLabel: string
  onPick: (value: string | null) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const choices = selected && !options.includes(selected) ? [selected, ...options] : options
  const pick = (value: string | null): void => {
    setOpen(false)
    if (value !== selected) {
      onPick(value)
    }
  }
  return (
    <DartChipRow state={state}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-label={label}
            aria-expanded={open}
            disabled={state.disabled || disabled}
            className={LINEAR_EDIT_CHIP_CLASS}
          >
            <span className="truncate">{valueLabel}</span>
            <ChevronDown className="size-3 shrink-0 opacity-55" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyLabel}</CommandEmpty>
              {extras?.map((extra) => (
                <CommandItem
                  key={extra.key}
                  value={extra.label}
                  onSelect={() => {
                    setOpen(false)
                    extra.onSelect()
                  }}
                >
                  {extra.label}
                </CommandItem>
              ))}
              {clearLabel ? (
                <CommandItem value={clearLabel} onSelect={() => pick(null)}>
                  <span className="flex-1">{clearLabel}</span>
                  {selected === null ? <Check className="size-4" /> : null}
                </CommandItem>
              ) : null}
              {extras?.length || clearLabel ? <CommandSeparator /> : null}
              {choices.map((choice) => (
                <CommandItem key={choice} value={choice} onSelect={() => pick(choice)}>
                  <span className="min-w-0 flex-1 truncate">{choice}</span>
                  {selected === choice ? <Check className="size-4" /> : null}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </DartChipRow>
  )
}
