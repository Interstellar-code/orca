import { useEffect, useRef, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import type { DartTask, DartWorkspaceConfig } from '../../../../../shared/dart/dart-types'
import {
  DART_TITLE_MAX_LENGTH,
  checkDartRequestText
} from '../../../../../shared/dart/dart-text-limits'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { isScreenSubmitShortcut } from '@/lib/screen-submit-shortcut'
import { cn } from '@/lib/utils'
import { dartTextTooLargeMessage } from '@/runtime/runtime-dart-write-client'
import { dartCreateArgs } from './dart-create-request'
import type { DartCreateTaskModel } from './dart-detail-contracts'
import { DartCreateFields } from './TaskCreateDialogFields'
import { TaskCreateDialogRecovery } from './TaskCreateDialogRecovery'
import { DartDiscardDraftDialog } from './DartDiscardDraftDialog'

export type DartCreateDialogModel = DartCreateTaskModel & {
  dartConfig: DartWorkspaceConfig | null
  dartConfigError?: string | null
  setDartRefreshNonce?: (updater: (nonce: number) => number) => void
  openDartDetailPage: (task: DartTask) => void
  createUnresolved?: boolean
  createLookingUp?: boolean
  createFieldsLocked?: boolean
  accountChecking?: boolean
  createTokenRejected?: boolean
  retryAccountCheck?: () => Promise<void>
  createWritesV2Pending?: boolean
  claimCreateMatch?: (task: DartTask) => void
  discardCreateDraft?: () => void
}

export function TaskPageDartCreateDialog({
  model
}: {
  model: DartCreateDialogModel
}): React.JSX.Element {
  const {
    createOpen,
    createSupportsWritesV2,
    createSubmitting,
    closeCreate,
    createTask,
    createDraft,
    setCreateDraft,
    createNotice,
    listChecked,
    createMatches,
    createMatchesTruncated,
    canCreateAnyway,
    dismissCreateNotice,
    checkAgain,
    dismissMatches,
    createAnyway,
    dartConfig,
    openDartDetailPage
  } = model
  const [showPending, setShowPending] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [seenCreateOpen, setSeenCreateOpen] = useState(createOpen)
  if (seenCreateOpen !== createOpen) {
    setSeenCreateOpen(createOpen)
    if (!createOpen) {
      setDiscardOpen(false)
    }
  }
  const contentRef = useRef<HTMLDivElement>(null)
  const focusWasInContentRef = useRef(false)
  useEffect(() => {
    if (!createSubmitting) {
      setShowPending(false)
      return
    }
    const timer = setTimeout(() => setShowPending(true), 200)
    return () => clearTimeout(timer)
  }, [createSubmitting])
  const blocked = createSubmitting || (model.createFieldsLocked ?? model.createUnresolved) === true
  const configUnavailable = !dartConfig || Boolean(model.dartConfigError)
  const refused = createNotice?.kind === 'refused'
  const recoveryBlocked =
    createSubmitting ||
    Boolean(model.createLookingUp) ||
    configUnavailable ||
    Boolean(model.accountChecking) ||
    Boolean(model.createWritesV2Pending)
  useEffect(() => {
    if (blocked && focusWasInContentRef.current) {
      const enabled = contentRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')
      if (enabled) {
        enabled.focus()
      } else {
        contentRef.current?.focus()
      }
      focusWasInContentRef.current = false
    }
  }, [blocked, configUnavailable])
  useEffect(() => {
    if (!blocked || !contentRef.current) {
      return
    }
    const enabled = contentRef.current.querySelector<HTMLButtonElement>('button:not([disabled])')
    if (
      !enabled &&
      document.activeElement instanceof HTMLElement &&
      contentRef.current.contains(document.activeElement)
    ) {
      contentRef.current.focus()
    }
  }, [blocked, configUnavailable])
  const descriptionCheck = checkDartRequestText('description', createDraft.description)
  const titleInvalid = createDraft.title.length > DART_TITLE_MAX_LENGTH
  const canSubmit =
    Boolean(createDraft.title.trim() && createDraft.dartboard) &&
    !titleInvalid &&
    descriptionCheck.ok &&
    !blocked &&
    !model.createUnresolved &&
    !model.createWritesV2Pending &&
    !refused &&
    Boolean(dartConfig) &&
    !model.dartConfigError
  const submit = (): void => {
    if (canSubmit) {
      void createTask(dartCreateArgs(createDraft, createSupportsWritesV2))
    }
  }
  return (
    <Dialog
      open={createOpen}
      onOpenChange={(open) => {
        if (!open && !createSubmitting) {
          closeCreate()
        }
      }}
    >
      <DialogContent
        aria-modal="true"
        ref={contentRef}
        onFocusCapture={() => {
          focusWasInContentRef.current = true
        }}
        className="sm:max-w-xl"
        scrollable
        showCloseButton={false}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          document.querySelector<HTMLButtonElement>('[data-dart-new-task]')?.focus()
        }}
        onEscapeKeyDown={(event) => {
          if (createSubmitting) {
            event.preventDefault()
          }
        }}
        onKeyDown={(event) => {
          if (isScreenSubmitShortcut(event)) {
            event.preventDefault()
            submit()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.task.page.dart.TaskCreateDialog.title', 'New Dart task')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.task.page.dart.TaskCreateDialog.description',
              'Creates a task in the selected dartboard.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label
              className="text-2xs font-medium text-muted-foreground"
              htmlFor="dart-create-title"
            >
              {translate('auto.components.task.page.dart.TaskCreateDialog.fieldTitle', 'Title')}
            </label>
            <Input
              id="dart-create-title"
              autoFocus
              value={createDraft.title}
              maxLength={DART_TITLE_MAX_LENGTH}
              aria-invalid={titleInvalid}
              disabled={blocked}
              placeholder={translate(
                'auto.components.task.page.dart.TaskCreateDialog.titlePlaceholder',
                'Task title'
              )}
              onChange={(event) => setCreateDraft({ title: event.target.value })}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  !event.nativeEvent.isComposing &&
                  !event.ctrlKey &&
                  !event.metaKey &&
                  !event.shiftKey &&
                  !event.altKey
                ) {
                  event.preventDefault()
                  submit()
                }
              }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              className="text-2xs font-medium text-muted-foreground"
              htmlFor="dart-create-description"
            >
              {translate(
                'auto.components.task.page.dart.TaskCreateDialog.fieldDescription',
                'Description'
              )}
            </label>
            <Textarea
              id="dart-create-description"
              rows={4}
              value={createDraft.description}
              disabled={blocked}
              aria-invalid={!descriptionCheck.ok}
              placeholder={translate(
                'auto.components.task.page.dart.TaskCreateDialog.bodyPlaceholder',
                'Add description…'
              )}
              onChange={(event) => setCreateDraft({ description: event.target.value })}
            />
            {!descriptionCheck.ok ? (
              <p role="alert" className="text-2xs text-destructive">
                {dartTextTooLargeMessage({
                  amount: descriptionCheck.size,
                  limit: descriptionCheck.limit,
                  unit: descriptionCheck.unit
                })}
              </p>
            ) : null}
          </div>
          <DartCreateFields
            createDraft={createDraft}
            setCreateDraft={setCreateDraft}
            dartConfig={dartConfig}
            dartConfigError={model.dartConfigError}
            retryConfig={() => model.setDartRefreshNonce?.((nonce) => nonce + 1)}
            createSupportsWritesV2={createSupportsWritesV2}
            blocked={blocked}
          />
          <TaskCreateDialogRecovery
            createNotice={createNotice}
            createUnresolved={model.createUnresolved}
            createMatches={createMatches}
            createMatchesTruncated={createMatchesTruncated}
            createLookingUp={model.createLookingUp}
            createFieldsLocked={model.createFieldsLocked}
            accountChecking={model.accountChecking}
            createTokenRejected={model.createTokenRejected}
            retryAccountCheck={model.retryAccountCheck}
            createWritesV2Pending={model.createWritesV2Pending}
            canCreateAnyway={canCreateAnyway}
            claimCreateMatch={model.claimCreateMatch}
            createSubmitting={createSubmitting}
            recoveryBlocked={recoveryBlocked}
            listChecked={listChecked}
            closeCreate={closeCreate}
            dismissCreateNotice={dismissCreateNotice}
            checkAgain={checkAgain}
            dismissMatches={dismissMatches}
            createAnyway={createAnyway}
            openDartDetailPage={openDartDetailPage}
            onDiscard={() => setDiscardOpen(true)}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={createSubmitting}
            onClick={closeCreate}
          >
            {translate('auto.components.task.page.dart.TaskCreateDialog.cancel', 'Cancel')}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canSubmit}
            aria-busy={createSubmitting}
            onClick={submit}
          >
            <span className="grid">
              <span
                aria-hidden={showPending}
                className={cn('col-start-1 row-start-1', showPending && 'invisible')}
              >
                {translate('auto.components.task.page.dart.TaskCreateDialog.create', 'Create task')}
              </span>
              {showPending ? (
                <span className="col-start-1 row-start-1 flex items-center gap-1.5">
                  <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />
                  {translate(
                    'auto.components.task.page.dart.TaskCreateDialog.creating',
                    'Creating…'
                  )}
                </span>
              ) : null}
            </span>
          </Button>
        </DialogFooter>
        <DartDiscardDraftDialog
          open={discardOpen}
          submitting={createSubmitting}
          onOpenChange={setDiscardOpen}
          onDiscard={() => model.discardCreateDraft?.()}
        />
      </DialogContent>
    </Dialog>
  )
}
