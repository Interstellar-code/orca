import { Columns3, List } from 'lucide-react'
import type { DartLayout } from '../../../../../shared/dart/dart-saved-views'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useNow } from '@/lib/window-activity/use-now'
import { useTranslate } from '@/i18n/use-translate'
import { formatRelativeTime } from '../task-page-source-context'
import type { DartLayoutSwitchDisabledReason } from './use-task-page-dart-state'

export function DartLayoutSwitch({
  layout,
  disabledReason,
  disabled,
  onChange
}: {
  layout: DartLayout
  disabledReason: DartLayoutSwitchDisabledReason | null
  disabled: boolean
  onChange: (layout: DartLayout) => void
}): React.JSX.Element {
  const t = useTranslate()
  const group = (
    <ToggleGroup
      type="single"
      value={layout}
      disabled={disabled}
      onValueChange={(value) => {
        if (value === 'list' || value === 'board') {
          onChange(value)
        }
      }}
      aria-label={t('auto.components.task.page.dart.Filters.layoutLabel', 'Dart layout')}
      variant="outline"
      size="sm"
    >
      <ToggleGroupItem value="list">
        <List />
        {t('auto.components.task.page.dart.Filters.layoutList', 'List')}
      </ToggleGroupItem>
      <ToggleGroupItem value="board">
        <Columns3 />
        {t('auto.components.task.page.dart.Filters.layoutBoard', 'Board')}
      </ToggleGroupItem>
    </ToggleGroup>
  )
  if (!disabledReason) {
    return group
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex">
          {group}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {disabledReason === 'linked'
          ? t(
              'auto.components.task.page.dart.Filters.boardLinkedOff',
              'Turn off linked tasks to use the board'
            )
          : t(
              'auto.components.task.page.dart.Filters.boardUpdateServer',
              'Update the remote Orca server to use the board'
            )}
      </TooltipContent>
    </Tooltip>
  )
}

export function DartUpdatedAgo({
  fetchedAt
}: {
  fetchedAt: number | null
}): React.JSX.Element | null {
  const t = useTranslate()
  const now = useNow(30_000)
  if (!fetchedAt) {
    return null
  }
  // Why: the shared clock ticks every 30 s, so a just-read set never reads as the future.
  const time = formatRelativeTime(new Date(Math.min(fetchedAt, now)).toISOString())
  return (
    <span className="text-2xs text-muted-foreground">
      {t('auto.components.task.page.dart.Filters.updatedAgo', 'Updated {{time}}', {
        time
      })}
    </span>
  )
}
