import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { LINEAR_EDIT_CHIP_CLASS } from '@/components/linear-item-drawer-edit-controls'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { translate } from '@/i18n/i18n'
import { DartChipRow, type DartFieldState } from './DartPropertyChips'

/** Only tags the workspace already has can be chosen: an unknown name would create a tag in Dart. */
export function DartTagsPicker({
  tags,
  options,
  state,
  disabled,
  onChange
}: {
  tags: readonly string[]
  options: readonly string[]
  state: DartFieldState
  disabled?: boolean
  onChange: (tags: string[]) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  // A tag on the task that the config no longer lists stays visible and removable.
  const choices = [...tags.filter((tag) => !options.includes(tag)), ...options]
  const toggle = (tag: string): void => {
    onChange(tags.includes(tag) ? tags.filter((current) => current !== tag) : [...tags, tag])
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="max-w-40 truncate rounded-full border border-border/50 bg-muted/35 px-1.5 py-0.5 text-2xs text-muted-foreground"
        >
          {tag}
        </span>
      ))}
      <DartChipRow state={state}>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={translate('auto.components.task.page.dart.DartTagsPicker.label', 'Tags')}
              aria-expanded={open}
              disabled={state.disabled || disabled}
              className={LINEAR_EDIT_CHIP_CLASS}
            >
              <span className="truncate">
                {tags.length > 0
                  ? translate('auto.components.task.page.dart.DartTagsPicker.edit', 'Edit tags')
                  : translate('auto.components.task.page.dart.DartTagsPicker.add', 'Add tags')}
              </span>
              <ChevronDown className="size-3 shrink-0 opacity-55" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64">
            <Command>
              <CommandInput
                placeholder={translate(
                  'auto.components.task.page.dart.DartTagsPicker.search',
                  'Search tags'
                )}
              />
              <CommandList>
                <CommandEmpty>
                  {translate(
                    'auto.components.task.page.dart.DartTagsPicker.empty',
                    'No tags found.'
                  )}
                </CommandEmpty>
                {choices.map((tag) => (
                  <CommandItem key={tag} value={tag} onSelect={() => toggle(tag)}>
                    <span className="min-w-0 flex-1 truncate">{tag}</span>
                    {tags.includes(tag) ? <Check className="size-4" /> : null}
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </DartChipRow>
    </div>
  )
}
