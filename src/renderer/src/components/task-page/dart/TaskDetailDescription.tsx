import { Pencil } from 'lucide-react'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import type { DartDetailDescriptionApi } from './dart-detail-contracts'
import { DartDescriptionConflictDialog } from './DartDescriptionConflictDialog'
import {
  DartDescriptionCopyMyText,
  DartDescriptionEditor,
  DartDescriptionEditorActions
} from './DartDescriptionEditor'
import { DartDescriptionOpenInDart, DartDescriptionReadOnly } from './DartDescriptionReadOnly'
import { InlineError, SkeletonLines } from './TaskDetailLoadStates'
import { DartTaskDetailNotice } from './TaskDetailNotice'
import { SectionHeading } from './TaskDetailSectionHeading'
import { useDartDescriptionEditor } from './use-dart-description-editor'

function DiscardPrompt({
  open,
  onConfirm,
  onDecline,
  onCloseAutoFocus
}: {
  open: boolean
  onConfirm: () => void
  onDecline: () => void
  onCloseAutoFocus: (event: Event) => void
}): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onDecline()}>
      <DialogContent size="compact" showCloseButton={false} onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle size="compact">
            {translate(
              'auto.components.task.page.dart.DartDescription.discardPrompt',
              'Discard unsaved description changes?'
            )}
          </DialogTitle>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={onDecline}>
            {translate('auto.components.task.page.dart.DartDescription.cancel', 'Cancel')}
          </Button>
          <Button type="button" variant="destructive" size="sm" onClick={onConfirm}>
            {translate('auto.components.task.page.dart.DartDescription.discard', 'Discard')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DescriptionSection({
  onRetry,
  ...api
}: DartDetailDescriptionApi & { onRetry: () => void }): React.JSX.Element {
  const { description, openUrl, supportsWritesV2 } = api
  const editor = useDartDescriptionEditor(api)
  const { lineage, conflict } = editor
  const editing = lineage !== null && supportsWritesV2
  const text = description.status === 'ready' ? description.value : null
  const canEdit = text !== null && text.trim() !== '' && supportsWritesV2
  const placeFocus = (event: Event): void => {
    if (editor.restoreFocus()) {
      event.preventDefault()
    }
  }
  const noticeActions = (
    <>
      {lineage ? <DartDescriptionCopyMyText lineage={lineage} /> : null}
      <DartDescriptionOpenInDart url={openUrl} />
    </>
  )
  return (
    <section
      className="space-y-2 px-4 py-4"
      data-dart-escape-local={editing ? '' : undefined}
      onKeyDown={editor.onSectionKeyDown}
    >
      <div className="flex min-h-6 flex-wrap items-center gap-2">
        <SectionHeading>
          {translate('auto.components.task.page.dart.TaskDetail.description', 'Description')}
        </SectionHeading>
        {editing ? (
          <span className="text-2xs text-muted-foreground">
            {translate(
              'auto.components.task.page.dart.DartDescription.editingHint',
              'Editing · only the parts you change are sent to Dart'
            )}
          </span>
        ) : null}
        <span className="flex-1" />
        {editing ? <DartDescriptionEditorActions editor={editor} /> : null}
        {!editing && canEdit ? (
          <Button
            ref={editor.editButtonRef}
            type="button"
            variant="outline"
            size="xs"
            onClick={() => editor.startEditing(text)}
          >
            <Pencil />
            {translate('auto.components.task.page.dart.DartDescription.edit', 'Edit')}
          </Button>
        ) : null}
      </div>
      {editor.sectionNotice ? (
        <DartTaskDetailNotice {...editor.sectionNotice} actions={noticeActions} />
      ) : null}
      {editor.localNotice ? (
        <DartTaskDetailNotice
          notice={editor.localNotice}
          dismissNotice={editor.dismissLocalNotice}
          recheckNotice={() => Promise.resolve()}
          actions={noticeActions}
        />
      ) : null}
      {editing ? <DartDescriptionEditor lineage={lineage} editor={editor} /> : null}
      {!editing && description.status === 'loading' ? <SkeletonLines /> : null}
      {!editing && description.status === 'error' ? (
        <InlineError message={description.message} onRetry={onRetry} />
      ) : null}
      {!editing && canEdit ? <CommentMarkdown content={text} variant="document" /> : null}
      {!editing && text !== null && !canEdit ? (
        <DartDescriptionReadOnly
          text={text}
          openUrl={openUrl}
          supportsWritesV2={supportsWritesV2}
        />
      ) : null}
      {conflict ? (
        <DartDescriptionConflictDialog
          latest={conflict.latest}
          editorText={conflict.editorText}
          unresolved={conflict.rebased.unresolved}
          onBackToEditing={editor.backToEditing}
          onDiscard={editor.discardFromConflict}
          onCloseAutoFocus={placeFocus}
        />
      ) : null}
      <DiscardPrompt
        open={editor.discardPromptOpen}
        onConfirm={editor.confirmDiscard}
        onDecline={editor.declineDiscard}
        onCloseAutoFocus={placeFocus}
      />
    </section>
  )
}

/** Keyed by draft, so a task switch starts from that task's stored lineage and no state crosses over. */
export function DartTaskDetailDescription(
  props: DartDetailDescriptionApi & { onRetry: () => void }
): React.JSX.Element {
  return <DescriptionSection key={props.draftKey} {...props} />
}
