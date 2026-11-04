import { AlertTriangle, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import { copyDescriptionText } from './dart-description-copy'
import type { DartDescriptionDraftHunk } from './dart-draft-store'
import { DartDescriptionHunkTexts } from './DartDescriptionHunkTexts'

const PANEL_CLASS =
  'scrollbar-sleek max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border/60 bg-muted/35 px-2.5 py-2 font-mono text-xs text-foreground'

/** Two actions only; there is no way to send the user's version over Dart's. */
export function DartDescriptionConflictDialog({
  latest,
  editorText,
  unresolved,
  onBackToEditing,
  onDiscard,
  onCloseAutoFocus
}: {
  latest: string
  editorText: string
  unresolved: readonly DartDescriptionDraftHunk[]
  onBackToEditing: () => void
  onDiscard: () => void
  onCloseAutoFocus?: (event: Event) => void
}): React.JSX.Element {
  return (
    <Dialog open onOpenChange={(open) => !open && onBackToEditing()}>
      <DialogContent
        showCloseButton={false}
        scrollable
        className="sm:max-w-2xl"
        onInteractOutside={(event) => event.preventDefault()}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <AlertTriangle className="size-4 flex-none text-muted-foreground" />
            {translate(
              'auto.components.task.page.dart.DartDescriptionConflictDialog.title',
              'This description changed in Dart while you were editing'
            )}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {translate(
              'auto.components.task.page.dart.DartDescriptionConflictDialog.body',
              'Nothing was saved and nothing was overwritten. Your text is below so you can copy it.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            {translate(
              'auto.components.task.page.dart.DartDescriptionConflictDialog.latest',
              'Now in Dart'
            )}
          </p>
          <div className={PANEL_CLASS}>{latest}</div>
        </div>
        <div className="min-w-0 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              {translate(
                'auto.components.task.page.dart.DartDescriptionConflictDialog.yourText',
                'Your text'
              )}
            </p>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => void copyDescriptionText(editorText)}
            >
              <Copy />
              {translate('auto.components.task.page.dart.DartDescription.copy', 'Copy')}
            </Button>
          </div>
          <div className={PANEL_CLASS} data-testid="dart-description-conflict-editor-text">
            {editorText}
          </div>
        </div>
        {unresolved.length > 0 ? (
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              {translate(
                'auto.components.task.page.dart.DartDescriptionConflictDialog.unresolved',
                "Changes Orca couldn't apply"
              )}
            </p>
            <ul className="space-y-2">
              {unresolved.map((hunk) => (
                <li key={hunk.id}>
                  <DartDescriptionHunkTexts hunk={hunk} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={onDiscard}>
            {translate(
              'auto.components.task.page.dart.DartDescriptionConflictDialog.discard',
              'Discard my changes'
            )}
          </Button>
          <Button type="button" size="sm" onClick={onBackToEditing}>
            {translate(
              'auto.components.task.page.dart.DartDescriptionConflictDialog.backToEditing',
              'Back to editing'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
