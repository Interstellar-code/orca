import { useEffect, useState } from 'react'
import { Copy } from 'lucide-react'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { getShortcutPlatform } from '@/lib/shortcut-platform'
import { cn } from '@/lib/utils'
import { copyDescriptionText, descriptionLineageText } from './dart-description-copy'
import { textareaText } from './dart-description-patch'
import type { DartDescriptionDraft } from './dart-draft-store'
import { DartDraftsFullAlert } from './DartCommentDraftWarning'
import { DartDescriptionHunkTexts } from './DartDescriptionHunkTexts'
import type { DartDescriptionEditorState } from './use-dart-description-editor'

export function DartDescriptionEditorActions({
  editor
}: {
  editor: DartDescriptionEditorState
}): React.JSX.Element {
  const pending = editor.savePending
  const [slow, setSlow] = useState(false)
  // A quick save stays clean; only a slow one gets the label swap.
  useEffect(() => {
    if (!pending) {
      setSlow(false)
      return
    }
    const timer = setTimeout(() => setSlow(true), 200)
    return () => clearTimeout(timer)
  }, [pending])
  const showSaving = pending && slow
  return (
    <>
      <Button type="button" variant="ghost" size="xs" disabled={pending} onClick={editor.cancel}>
        {translate('auto.components.task.page.dart.DartDescription.cancel', 'Cancel')}
      </Button>
      <Button
        type="button"
        size="xs"
        disabled={editor.saveDisabled}
        aria-busy={pending}
        onClick={() => void editor.save()}
      >
        {/* Both labels share one grid cell, so the width never moves between them. */}
        <span className="grid justify-items-center">
          <span
            aria-hidden={showSaving}
            className={cn('col-start-1 row-start-1', showSaving && 'invisible')}
          >
            {translate('auto.components.task.page.dart.DartDescription.save', 'Save')}
          </span>
          <span
            aria-hidden={!showSaving}
            className={cn('col-start-1 row-start-1', !showSaving && 'invisible')}
          >
            {translate('auto.components.task.page.dart.DartDescription.saving', 'Saving…')}
          </span>
        </span>
      </Button>
    </>
  )
}

function FullDraftsWarning({ editor }: { editor: DartDescriptionEditorState }) {
  const oldest = editor.fullDraft
  return oldest ? (
    <DartDraftsFullAlert target={oldest} onDiscard={editor.discardOldestDraft} />
  ) : null
}

function UnresolvedHunks({
  lineage,
  editor
}: {
  lineage: DartDescriptionDraft
  editor: DartDescriptionEditorState
}) {
  if (lineage.unresolved.length === 0) {
    return null
  }
  return (
    <div className="space-y-2 rounded-md border border-border/60 p-2.5">
      <p className="text-xs font-medium text-foreground">
        {translate(
          'auto.components.task.page.dart.DartDescription.unresolvedTitle',
          "Changes Orca couldn't apply. Type what you want to keep into the text above."
        )}
      </p>
      <ul className="space-y-3">
        {lineage.unresolved.map((hunk) => (
          <li key={hunk.id} className="space-y-1.5">
            <DartDescriptionHunkTexts hunk={hunk} />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={editor.savePending}
                onClick={() => editor.removeHunk(hunk.id)}
              >
                {translate(
                  'auto.components.task.page.dart.DartDescription.markResolved',
                  'Mark resolved'
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={editor.savePending}
                onClick={() => editor.removeHunk(hunk.id)}
              >
                {translate(
                  'auto.components.task.page.dart.DartDescription.discardHunk',
                  'Discard this change'
                )}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function DartDescriptionEditor({
  lineage,
  editor
}: {
  lineage: DartDescriptionDraft
  editor: DartDescriptionEditorState
}): React.JSX.Element {
  const { preview } = editor
  const isMac = getShortcutPlatform() === 'darwin'
  return (
    <div className="space-y-2">
      <FullDraftsWarning editor={editor} />
      {/* Stays mounted under the preview: the caret and undo history outlive the toggle. */}
      <Textarea
        ref={editor.textareaRef}
        variant="code"
        rows={14}
        readOnly={editor.saving}
        aria-label={translate(
          'auto.components.task.page.dart.DartDescription.editorLabel',
          'Description (Markdown)'
        )}
        className={cn('resize-y', preview && 'hidden')}
        value={textareaText(lineage.draft)}
        onChange={(event) => editor.changeDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (isMac ? event.metaKey : event.ctrlKey)) {
            event.preventDefault()
            void editor.save()
          }
        }}
      />
      {preview ? (
        <div className="min-h-40 rounded-md border border-border/60 px-3 py-2">
          <CommentMarkdown content={lineage.draft} variant="document" />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          aria-pressed={preview}
          onClick={editor.togglePreview}
        >
          {translate('auto.components.task.page.dart.DartDescription.preview', 'Preview')}
        </Button>
        <p className="min-w-0 flex-1 text-2xs text-muted-foreground">
          {editor.saveBlocked
            ? translate(
                'auto.components.task.page.dart.DartDescription.saveBlocked',
                'Dart may have applied your last save. Check again or dismiss its notice to save again.'
              )
            : isMac
              ? translate(
                  'auto.components.task.page.dart.DartDescription.shortcutMac',
                  'Markdown · ⌘↵ to save'
                )
              : translate(
                  'auto.components.task.page.dart.DartDescription.shortcutOther',
                  'Markdown · Ctrl+Enter to save'
                )}
        </p>
      </div>
      <UnresolvedHunks lineage={lineage} editor={editor} />
    </div>
  )
}

export function DartDescriptionCopyMyText({
  lineage
}: {
  lineage: DartDescriptionDraft
}): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      onClick={() => void copyDescriptionText(descriptionLineageText(lineage))}
    >
      <Copy />
      {translate('auto.components.task.page.dart.DartDescription.copyMyText', 'Copy my text')}
    </Button>
  )
}
