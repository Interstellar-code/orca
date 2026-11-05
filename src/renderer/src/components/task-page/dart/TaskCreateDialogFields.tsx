import { Check } from 'lucide-react'
import type { DartWorkspaceConfig } from '../../../../../shared/dart/dart-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { DartCreateDraft } from './dart-detail-contracts'
import { InlineError } from './TaskDetailLoadStates'

type CreateFieldKey = 'dartboard' | 'type' | 'status' | 'priority' | 'assignee'

export type DartCreateFieldsProps = {
  createDraft: DartCreateDraft
  setCreateDraft: (patch: Partial<DartCreateDraft>) => void
  dartConfig: DartWorkspaceConfig | null
  dartConfigError?: string | null
  retryConfig: () => void
  createSupportsWritesV2: boolean
  blocked: boolean
}

/** The named fields of the create dialog; every select holds a canonical name from the config. */
export function DartCreateFields({
  createDraft,
  setCreateDraft,
  dartConfig,
  dartConfigError,
  retryConfig,
  createSupportsWritesV2,
  blocked
}: DartCreateFieldsProps): React.JSX.Element {
  if (dartConfigError) {
    return <InlineError message={dartConfigError} onRetry={retryConfig} />
  }
  if (!dartConfig) {
    return (
      <p role="status" className="text-xs text-muted-foreground">
        {translate(
          'auto.components.task.page.dart.TaskCreateDialog.loadingConfig',
          'Loading dartboards…'
        )}
      </p>
    )
  }
  const fields: { key: CreateFieldKey; label: string; options: string[] }[] = [
    {
      key: 'dartboard',
      label: translate('auto.components.task.page.dart.TaskCreateDialog.dartboard', 'Dartboard'),
      options: dartConfig.dartboards
    },
    ...(dartConfig?.types.length
      ? [
          {
            key: 'type' as const,
            label: translate('auto.components.task.page.dart.TaskCreateDialog.type', 'Type'),
            options: dartConfig.types
          }
        ]
      : []),
    {
      key: 'status',
      label: translate('auto.components.task.page.dart.TaskCreateDialog.status', 'Status'),
      options: dartConfig?.statuses ?? []
    },
    {
      key: 'priority',
      label: translate('auto.components.task.page.dart.TaskCreateDialog.priority', 'Priority'),
      options: dartConfig?.priorities ?? []
    },
    {
      key: 'assignee',
      label: translate('auto.components.task.page.dart.TaskCreateDialog.assignee', 'Assignee'),
      options: dartConfig?.assignees ?? []
    }
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map(({ key, label, options }) => (
        <div key={key} className="flex min-w-0 flex-col gap-1">
          <label
            className="text-2xs font-medium text-muted-foreground"
            htmlFor={`dart-create-${key}`}
          >
            {label}
          </label>
          <Select
            value={createDraft[key] || (key === 'dartboard' ? undefined : '__unset__')}
            disabled={blocked}
            onValueChange={(value) => setCreateDraft({ [key]: value === '__unset__' ? '' : value })}
          >
            <SelectTrigger
              id={`dart-create-${key}`}
              size="sm"
              aria-label={label}
              className="w-full"
              locked
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {key !== 'dartboard' ? (
                <SelectItem value="__unset__">
                  {translate('auto.components.task.page.dart.TaskCreateDialog.default', 'Default')}
                </SelectItem>
              ) : null}
              {options.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
      <div className="flex min-w-0 flex-col gap-1">
        <label className="text-2xs font-medium text-muted-foreground">
          {translate('auto.components.task.page.dart.TaskCreateDialog.tags', 'Tags')}
        </label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={blocked || !dartConfig?.tags.length}
              aria-label={translate('auto.components.task.page.dart.TaskCreateDialog.tags', 'Tags')}
              className="justify-start"
              locked={blocked}
            >
              <span className="truncate">
                {createDraft.tags.join(', ') ||
                  translate('auto.components.task.page.dart.TaskCreateDialog.noTags', 'No tags')}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="max-h-56 w-56">
            <div className="scrollbar-sleek flex max-h-56 w-56 flex-col gap-1 overflow-y-auto">
              {dartConfig?.tags.map((tag) => (
                <Button
                  key={tag}
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-pressed={createDraft.tags.includes(tag)}
                  className="w-full justify-start"
                  onClick={() =>
                    setCreateDraft({
                      tags: createDraft.tags.includes(tag)
                        ? createDraft.tags.filter((entry) => entry !== tag)
                        : [...createDraft.tags, tag]
                    })
                  }
                >
                  <Check className={cn('size-4', !createDraft.tags.includes(tag) && 'invisible')} />
                  {tag}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {createSupportsWritesV2 || createDraft.dueAt ? (
        <div className="flex flex-col gap-1">
          <label className="text-2xs font-medium text-muted-foreground" htmlFor="dart-create-due">
            {translate('auto.components.task.page.dart.TaskCreateDialog.dueDate', 'Due date')}
          </label>
          <Input
            id="dart-create-due"
            type="date"
            className="h-8"
            locked
            value={createDraft.dueAt}
            disabled={blocked}
            onChange={(event) => setCreateDraft({ dueAt: event.target.value })}
          />
        </div>
      ) : null}
    </div>
  )
}
