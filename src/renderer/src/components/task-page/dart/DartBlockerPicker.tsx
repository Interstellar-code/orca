import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { LoaderCircle, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { DartRelationshipsApi } from './dart-board-contracts'
import { getDartStatusTone } from './task-page-dart-list-model'

const SEARCH_DEBOUNCE_MS = 300
const SPINNER_DELAY_MS = 200

export type DartBlockerPickerProps = {
  taskId: string
  excludeIds: readonly string[]
  disabled?: boolean
  // True when the task has no dartboard to filter by: the toggle is off and locked.
  dartboardOnlyUnavailable?: boolean
  searchTasks: DartRelationshipsApi['searchTasks']
  onPick: (task: DartTask) => void
}

type SearchState =
  | { kind: 'idle' }
  | { kind: 'loading'; slow: boolean }
  | { kind: 'results'; tasks: readonly DartTask[] }
  | { kind: 'error'; message: string }

export function DartBlockerPicker({
  taskId,
  excludeIds,
  disabled,
  dartboardOnlyUnavailable = false,
  searchTasks,
  onPick
}: DartBlockerPickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [thisDartboardOnly, setThisDartboardOnly] = useState(false)
  const [search, setSearch] = useState<SearchState>({ kind: 'idle' })
  const requestId = useRef(0)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const spinnerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toggleId = useId()
  const dartboardOnlyActive = thisDartboardOnly && !dartboardOnlyUnavailable

  const clearTimers = useCallback((): void => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
      debounceTimer.current = null
    }
    if (spinnerTimer.current) {
      clearTimeout(spinnerTimer.current)
      spinnerTimer.current = null
    }
  }, [])

  // Every reply that is not for the latest request id is dropped, including after close or unmount.
  const abandon = useCallback((): void => {
    requestId.current += 1
    clearTimers()
  }, [clearTimers])

  useEffect(() => abandon, [abandon])

  const run = useCallback(
    async (query: string, dartboardOnly: boolean): Promise<void> => {
      abandon()
      const id = requestId.current
      setSearch({ kind: 'loading', slow: false })
      spinnerTimer.current = setTimeout(() => {
        if (requestId.current === id) {
          setSearch({ kind: 'loading', slow: true })
        }
      }, SPINNER_DELAY_MS)
      let next: SearchState
      try {
        const result = await searchTasks(query, { thisDartboardOnly: dartboardOnly })
        next = result.ok
          ? { kind: 'results', tasks: result.tasks }
          : { kind: 'error', message: result.error }
      } catch (error) {
        next = { kind: 'error', message: error instanceof Error ? error.message : '' }
      }
      if (requestId.current !== id) {
        return
      }
      clearTimers()
      setSearch(next)
    },
    [abandon, clearTimers, searchTasks]
  )

  const reset = (): void => {
    abandon()
    setText('')
    setThisDartboardOnly(false)
    setSearch({ kind: 'idle' })
  }

  const changeText = (value: string): void => {
    setText(value)
    abandon()
    if (value.trim() === '') {
      setSearch({ kind: 'idle' })
      return
    }
    // Old results do not match the new text, so they must not be selectable while the debounce waits.
    setSearch({ kind: 'loading', slow: false })
    debounceTimer.current = setTimeout(
      () => void run(value, dartboardOnlyActive),
      SEARCH_DEBOUNCE_MS
    )
  }

  // A mode flip is a new query: it runs now, drops the old mode's results and any in-flight reply.
  const changeMode = useCallback(
    (next: boolean): void => {
      setThisDartboardOnly(next)
      abandon()
      setSearch({ kind: 'idle' })
      if (text.trim() !== '') {
        void run(text, next)
      }
    },
    [abandon, run, text]
  )

  const modeForcedOff = useRef(false)
  if (dartboardOnlyUnavailable && thisDartboardOnly) {
    modeForcedOff.current = true
    setThisDartboardOnly(false)
  }
  const textRef = useRef(text)
  textRef.current = text
  useEffect(() => {
    if (!modeForcedOff.current) {
      return
    }
    modeForcedOff.current = false
    abandon()
    setSearch({ kind: 'idle' })
    if (textRef.current.trim() !== '') {
      void run(textRef.current, false)
    }
  }, [dartboardOnlyUnavailable, abandon, run])

  const pick = (task: DartTask): void => {
    setOpen(false)
    reset()
    onPick(task)
  }

  const offered =
    search.kind === 'results'
      ? search.tasks.filter((task) => task.id !== taskId && !excludeIds.includes(task.id))
      : []

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          reset()
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="xs" disabled={disabled}>
          <Plus />
          {translate('auto.components.task.page.dart.DartBlockerPicker.add', 'Add blocker')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <Command shouldFilter={false}>
          <CommandInput
            value={text}
            onValueChange={changeText}
            placeholder={translate(
              'auto.components.task.page.dart.DartBlockerPicker.search',
              'Search tasks'
            )}
            trailing={
              search.kind === 'loading' && search.slow ? (
                <LoaderCircle
                  role="status"
                  aria-label={translate(
                    'auto.components.task.page.dart.DartBlockerPicker.searching',
                    'Searching'
                  )}
                  className="size-4 shrink-0 animate-spin text-muted-foreground"
                />
              ) : null
            }
          />
          <div className="border-b border-border px-3 py-1.5">
            <div className="flex items-center gap-2">
              <Switch
                id={toggleId}
                checked={dartboardOnlyActive}
                disabled={dartboardOnlyUnavailable}
                onCheckedChange={changeMode}
                className="h-4 w-7"
                thumbClassName="size-3 data-[state=checked]:translate-x-3"
              />
              <Label htmlFor={toggleId} variant="settings">
                {translate(
                  'auto.components.task.page.dart.DartBlockerPicker.thisDartboardOnly',
                  'This dartboard only'
                )}
              </Label>
            </div>
            {dartboardOnlyUnavailable ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {translate(
                  'auto.components.task.page.dart.DartBlockerPicker.dartboardOnlyUnavailable',
                  'This task has no dartboard.'
                )}
              </p>
            ) : null}
          </div>
          <CommandList>
            {search.kind === 'idle' ? (
              <PickerNote>
                {translate(
                  'auto.components.task.page.dart.DartBlockerPicker.hint',
                  'Type to search tasks'
                )}
              </PickerNote>
            ) : null}
            {search.kind === 'error' ? (
              <div
                role="alert"
                className="flex items-center justify-between gap-2 px-3 py-3 text-xs text-destructive"
              >
                <span className="min-w-0">
                  {search.message ||
                    translate(
                      'auto.components.task.page.dart.DartBlockerPicker.error',
                      'Search failed'
                    )}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => void run(text, dartboardOnlyActive)}
                >
                  {translate('auto.components.task.page.dart.DartBlockerPicker.retry', 'Retry')}
                </Button>
              </div>
            ) : null}
            {search.kind === 'results' && offered.length === 0 ? (
              <PickerNote>
                {translate(
                  'auto.components.task.page.dart.DartBlockerPicker.empty',
                  'No matching tasks'
                )}
              </PickerNote>
            ) : null}
            {offered.map((task) => (
              <CommandItem key={task.id} value={task.id} onSelect={() => pick(task)}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{task.title}</span>
                  {task.dartboard ? (
                    <span className="block truncate text-2xs text-muted-foreground">
                      {task.dartboard}
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    'inline-flex max-w-24 shrink-0 items-center rounded-full border px-1.5 py-0.5 text-2xs font-medium',
                    getDartStatusTone(task.status)
                  )}
                >
                  <span className="truncate">{task.status ?? '—'}</span>
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function PickerNote({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <p role="status" className="px-3 py-4 text-center text-xs text-muted-foreground">
      {children}
    </p>
  )
}
