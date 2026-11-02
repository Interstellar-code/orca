import { LoaderCircle, RefreshCw, X } from 'lucide-react'
import type { DartWorkspaceConfig } from '../../../../../shared/dart/dart-types'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { shouldSuppressEnterSubmit } from '@/lib/new-workspace-enter-guard'
import type { TaskPageComposerActionsModel } from '../use-task-page-composer-actions'
import type { DartListFilters } from './task-page-dart-list-model'

const ALL_VALUE = '__all__'

export type TaskPageDartFiltersProps = {
  filters: DartListFilters
  config: DartWorkspaceConfig | null
  viewerAvailable: boolean
  hasWorkspace: boolean
  loading: boolean
  searchInput: string
  onFilterChange: <K extends keyof DartListFilters>(key: K, value: DartListFilters[K]) => void
  onHasWorkspaceChange: (enabled: boolean) => void
  onSearchInputChange: (value: string) => void
  onSearchApply: (value: string) => void
  onRefresh: () => void
}

function FilterSelect({
  label,
  value,
  allLabel,
  options,
  disabled,
  onChange
}: {
  label: string
  value: string | null
  allLabel: string
  options: readonly string[]
  disabled: boolean
  onChange: (value: string | null) => void
}): React.JSX.Element {
  // Keep an applied value selectable even if the loaded config no longer lists it.
  const choices = value && !options.includes(value) ? [value, ...options] : options
  return (
    <Select
      value={value ?? ALL_VALUE}
      onValueChange={(next) => onChange(next === ALL_VALUE ? null : next)}
      disabled={disabled}
    >
      <SelectTrigger size="sm" aria-label={label} className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_VALUE}>{allLabel}</SelectItem>
        {choices.map((choice) => (
          <SelectItem key={choice} value={choice}>
            {choice}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function TaskPageDartFiltersView({
  filters,
  config,
  viewerAvailable,
  hasWorkspace,
  loading,
  searchInput,
  onFilterChange,
  onHasWorkspaceChange,
  onSearchInputChange,
  onSearchApply,
  onRefresh
}: TaskPageDartFiltersProps): React.JSX.Element {
  const mineActive = filters.mine && viewerAvailable && !hasWorkspace
  const allActive = (!filters.mine || !viewerAvailable) && !hasWorkspace
  const serverFiltersDisabled = hasWorkspace
  return (
    <div className="rounded-md rounded-b-none border border-border/50 bg-muted/50 px-3 py-2 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <ButtonGroup>
            <Button
              type="button"
              size="sm"
              variant={mineActive ? 'secondary' : 'outline'}
              aria-pressed={mineActive}
              disabled={!viewerAvailable || hasWorkspace}
              onClick={() => onFilterChange('mine', true)}
            >
              {translate('auto.components.task.page.dart.Filters.assignedToMe', 'Assigned to me')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={allActive ? 'secondary' : 'outline'}
              aria-pressed={allActive}
              disabled={hasWorkspace}
              onClick={() => onFilterChange('mine', false)}
            >
              {translate('auto.components.task.page.dart.Filters.allTasks', 'All tasks')}
            </Button>
          </ButtonGroup>
          <FilterSelect
            label={translate('auto.components.task.page.dart.Filters.statusFilter', 'Status')}
            value={filters.status}
            allLabel={translate(
              'auto.components.task.page.dart.Filters.allStatuses',
              'All statuses'
            )}
            options={config?.statuses ?? []}
            disabled={serverFiltersDisabled}
            onChange={(value) => onFilterChange('status', value)}
          />
          <FilterSelect
            label={translate('auto.components.task.page.dart.Filters.dartboardFilter', 'Dartboard')}
            value={filters.dartboard}
            allLabel={translate(
              'auto.components.task.page.dart.Filters.allDartboards',
              'All dartboards'
            )}
            options={config?.dartboards ?? []}
            disabled={serverFiltersDisabled}
            onChange={(value) => onFilterChange('dartboard', value)}
          />
          <Button
            type="button"
            size="sm"
            variant={hasWorkspace ? 'secondary' : 'ghost'}
            aria-pressed={hasWorkspace}
            onClick={() => {
              onSearchInputChange('')
              onSearchApply('')
              onHasWorkspaceChange(!hasWorkspace)
            }}
          >
            {translate('auto.components.task.page.dart.Filters.hasWorkspace', 'Has Workspace')}
          </Button>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onRefresh}
              disabled={loading}
              aria-label={translate(
                'auto.components.task.page.dart.Filters.refresh',
                'Refresh Dart tasks'
              )}
            >
              {loading ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {translate('auto.components.task.page.dart.Filters.refresh', 'Refresh Dart tasks')}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Input
          value={searchInput}
          onChange={(event) => onSearchInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !shouldSuppressEnterSubmit(
                {
                  isComposing: event.nativeEvent.isComposing,
                  shiftKey: event.shiftKey
                },
                false
              )
            ) {
              event.preventDefault()
              onSearchApply(searchInput)
            }
          }}
          aria-label={translate('auto.components.task.page.dart.Filters.searchLabel', 'Search')}
          placeholder={
            hasWorkspace
              ? translate(
                  'auto.components.task.page.dart.Filters.searchLinked',
                  'Search linked tasks'
                )
              : translate(
                  'auto.components.task.page.dart.Filters.searchTitles',
                  'Search task titles, then press Enter'
                )
          }
        />
        {searchInput ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={translate(
              'auto.components.task.page.dart.Filters.clearSearch',
              'Clear search'
            )}
            onClick={() => {
              onSearchInputChange('')
              onSearchApply('')
            }}
          >
            <X className="size-4" />
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export function TaskPageDartFilters({
  model
}: {
  model: TaskPageComposerActionsModel
}): React.JSX.Element {
  return (
    <TaskPageDartFiltersView
      filters={model.dartFilters}
      config={model.dartConfig}
      viewerAvailable={Boolean(model.dartStatus.viewer)}
      hasWorkspace={model.dartHasWorkspace}
      loading={model.dartLoading}
      searchInput={model.dartSearchInput}
      onFilterChange={model.setDartFilter}
      onHasWorkspaceChange={model.setDartHasWorkspace}
      onSearchInputChange={model.setDartSearchInput}
      onSearchApply={model.applyDartSearch}
      onRefresh={() => model.setDartRefreshNonce((n) => n + 1)}
    />
  )
}
