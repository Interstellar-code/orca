import { useState } from 'react'
import { Check, LayoutList, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  DART_SAVED_VIEWS_UPDATE_REQUIRED,
  MAX_DART_SAVED_VIEW_NAME_LENGTH,
  MAX_DART_SAVED_VIEWS,
  type DartSavedView
} from '../../../../../shared/dart/dart-saved-views'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { DartSavedViewsModel } from './dart-board-contracts'

type SavedViewDraft = { mode: 'create' | 'rename'; id: string | null; name: string }

type TaskPageDartSavedViewsProps = {
  model: DartSavedViewsModel
  disabled?: boolean
}

function normalizedName(name: string): string {
  return name.trim().toLowerCase()
}

export function TaskPageDartSavedViews({
  model,
  disabled = false
}: TaskPageDartSavedViewsProps): React.JSX.Element {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [draft, setDraft] = useState<SavedViewDraft | null>(null)

  if (!model.supported) {
    return (
      <p className="text-xs text-muted-foreground">
        {translate(
          'auto.components.task.page.dart.TaskPageDartSavedViews.updateRequired',
          DART_SAVED_VIEWS_UPDATE_REQUIRED
        )}
      </p>
    )
  }

  const activeView = model.views.find((view) => view.id === model.activeViewId) ?? null
  const busy = disabled || model.pending || model.load.state === 'loading'
  const viewLimitReached = model.views.length >= MAX_DART_SAVED_VIEWS
  const duplicateName = draft
    ? model.views.some(
        (view) => view.id !== draft.id && normalizedName(view.name) === normalizedName(draft.name)
      )
    : false
  const canSubmit = Boolean(
    draft?.name.trim() && draft.name.length <= MAX_DART_SAVED_VIEW_NAME_LENGTH && !duplicateName
  )

  const openCreateDialog = (): void => {
    setPopoverOpen(false)
    setDraft({ mode: 'create', id: null, name: '' })
  }

  const openRenameDialog = (view: DartSavedView): void => {
    setPopoverOpen(false)
    setDraft({ mode: 'rename', id: view.id, name: view.name })
  }

  const submitDraft = async (): Promise<void> => {
    if (!draft || !canSubmit) {
      return
    }
    const done =
      draft.mode === 'rename' && draft.id
        ? await model.rename(draft.id, draft.name)
        : await model.saveAsNew(draft.name)
    if (done) {
      setDraft(null)
    }
  }

  return (
    <>
      <div className="flex min-w-0 items-center gap-1.5">
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="xs" className="max-w-48">
              <LayoutList />
              <span className="truncate">
                {activeView
                  ? activeView.name
                  : translate(
                      'auto.components.task.page.dart.TaskPageDartSavedViews.trigger',
                      'Saved views'
                    )}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" sideOffset={6} className="w-72">
            <div className="border-b border-border/50 px-3 py-2">
              <p className="text-xs font-medium">
                {translate(
                  'auto.components.task.page.dart.TaskPageDartSavedViews.heading',
                  'Saved views'
                )}
              </p>
            </div>
            {model.load.state === 'error' ? (
              <div className="space-y-2 p-3">
                <p role="alert" className="text-xs text-destructive">
                  {model.load.error}
                </p>
                <Button size="xs" variant="outline" onClick={model.load.retry}>
                  {translate(
                    'auto.components.task.page.dart.TaskPageDartSavedViews.retry',
                    'Retry'
                  )}
                </Button>
              </div>
            ) : null}
            <Command>
              <CommandInput
                placeholder={translate(
                  'auto.components.task.page.dart.TaskPageDartSavedViews.find',
                  'Find a saved view'
                )}
              />
              <CommandList className="max-h-72">
                {model.views.length > 0 ? (
                  <CommandEmpty>
                    {translate(
                      'auto.components.task.page.dart.TaskPageDartSavedViews.noMatch',
                      'No matching views.'
                    )}
                  </CommandEmpty>
                ) : (
                  <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                    {translate(
                      'auto.components.task.page.dart.TaskPageDartSavedViews.empty',
                      'No saved views yet.'
                    )}
                  </p>
                )}
                {model.views.map((view) => {
                  const active = view.id === model.activeViewId
                  return (
                    <CommandItem
                      key={view.id}
                      value={view.name}
                      disabled={busy}
                      className="group"
                      onSelect={() => {
                        setPopoverOpen(false)
                        void model.apply(view.id)
                      }}
                    >
                      <div
                        aria-current={active ? 'true' : undefined}
                        className="flex min-w-0 flex-1 items-center gap-2 text-xs"
                      >
                        <Check
                          aria-hidden
                          className={active ? 'size-3.5 shrink-0' : 'size-3.5 shrink-0 opacity-0'}
                        />
                        <span className="truncate">{view.name}</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={translate(
                          'auto.components.task.page.dart.TaskPageDartSavedViews.edit',
                          'Edit {{value0}}',
                          { value0: view.name }
                        )}
                        disabled={busy}
                        onClick={(event) => {
                          event.stopPropagation()
                          openRenameDialog(view)
                        }}
                      >
                        <Pencil />
                      </Button>
                    </CommandItem>
                  )
                })}
              </CommandList>
            </Command>
            <div className="border-t border-border/50 p-1">
              {viewLimitReached ? (
                <p className="px-2 py-1 text-xs text-muted-foreground">
                  {translate(
                    'auto.components.task.page.dart.TaskPageDartSavedViews.limit',
                    'You can save up to {{value0}} views.',
                    { value0: MAX_DART_SAVED_VIEWS }
                  )}
                </p>
              ) : null}
              {activeView ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  disabled={busy}
                  onClick={() => {
                    setPopoverOpen(false)
                    void model.apply(null)
                  }}
                >
                  {translate(
                    'auto.components.task.page.dart.TaskPageDartSavedViews.clear',
                    'Stop using this view'
                  )}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                disabled={busy || viewLimitReached}
                onClick={openCreateDialog}
              >
                <Plus />
                {activeView
                  ? translate(
                      'auto.components.task.page.dart.TaskPageDartSavedViews.saveAsNew',
                      'Save as new'
                    )
                  : translate(
                      'auto.components.task.page.dart.TaskPageDartSavedViews.saveView',
                      'Save view'
                    )}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
        {activeView && model.modified ? (
          <>
            <span className="text-xs text-muted-foreground">
              {translate(
                'auto.components.task.page.dart.TaskPageDartSavedViews.modified',
                'Modified'
              )}
            </span>
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={busy}
              onClick={() => void model.saveCurrent()}
            >
              {translate('auto.components.task.page.dart.TaskPageDartSavedViews.save', 'Save')}
            </Button>
          </>
        ) : null}
      </div>

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {draft?.mode === 'rename'
                ? translate(
                    'auto.components.task.page.dart.TaskPageDartSavedViews.renameTitle',
                    'Edit saved view'
                  )
                : translate(
                    'auto.components.task.page.dart.TaskPageDartSavedViews.createTitle',
                    'Save view'
                  )}
            </DialogTitle>
            <DialogDescription>
              {draft?.mode === 'rename'
                ? translate(
                    'auto.components.task.page.dart.TaskPageDartSavedViews.renameDescription',
                    'Rename this view or delete it.'
                  )
                : translate(
                    'auto.components.task.page.dart.TaskPageDartSavedViews.createDescription',
                    'Name the current filters and layout to reuse them later.'
                  )}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              void submitDraft()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="dart-saved-view-name">
                {translate('auto.components.task.page.dart.TaskPageDartSavedViews.name', 'Name')}
              </Label>
              <Input
                id="dart-saved-view-name"
                autoFocus
                required
                maxLength={MAX_DART_SAVED_VIEW_NAME_LENGTH}
                value={draft?.name ?? ''}
                aria-invalid={duplicateName || undefined}
                onChange={(event) =>
                  setDraft((current) =>
                    current ? { ...current, name: event.target.value } : current
                  )
                }
              />
              {duplicateName ? (
                <p role="alert" className="text-xs text-destructive">
                  {translate(
                    'auto.components.task.page.dart.TaskPageDartSavedViews.duplicate',
                    'A saved view with this name already exists.'
                  )}
                </p>
              ) : null}
            </div>
            <DialogFooter className={draft?.mode === 'rename' ? 'sm:justify-between' : undefined}>
              {draft?.mode === 'rename' ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    if (draft.id) {
                      void model.remove(draft.id).then((done) => done && setDraft(null))
                    }
                  }}
                >
                  <Trash2 />
                  {translate(
                    'auto.components.task.page.dart.TaskPageDartSavedViews.delete',
                    'Delete view'
                  )}
                </Button>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(null)}>
                  {translate(
                    'auto.components.task.page.dart.TaskPageDartSavedViews.cancel',
                    'Cancel'
                  )}
                </Button>
                <Button type="submit" size="sm" disabled={busy || !canSubmit}>
                  {draft?.mode === 'rename'
                    ? translate(
                        'auto.components.task.page.dart.TaskPageDartSavedViews.rename',
                        'Rename'
                      )
                    : translate(
                        'auto.components.task.page.dart.TaskPageDartSavedViews.create',
                        'Save view'
                      )}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
