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

type DartDiscardDraftDialogProps = {
  open: boolean
  submitting: boolean
  onOpenChange: (open: boolean) => void
  onDiscard: () => void
}

export function DartDiscardDraftDialog({
  open,
  submitting,
  onOpenChange,
  onDiscard
}: DartDiscardDraftDialogProps): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent role="alertdialog" size="compact">
        <DialogHeader>
          <DialogTitle size="compact">
            {translate(
              'auto.components.task.page.dart.TaskCreateDialog.confirmDiscardTitle',
              'Discard draft?'
            )}
          </DialogTitle>
          <DialogDescription size="compact">
            {translate(
              'auto.components.task.page.dart.TaskCreateDialog.confirmDiscard',
              'Discard this draft? Dart may already have created the task.'
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            {translate('auto.components.task.page.dart.TaskCreateDialog.cancel', 'Cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={submitting}
            onClick={() => {
              onOpenChange(false)
              onDiscard()
            }}
          >
            {translate(
              'auto.components.task.page.dart.TaskCreateDialog.discardDraft',
              'Discard draft'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
