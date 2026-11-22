import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useTranslate } from '@/i18n/use-translate'

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
  const t = useTranslate()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent role="alertdialog" size="compact">
        <DialogHeader>
          <DialogTitle size="compact">
            {t(
              'auto.components.task.page.dart.TaskCreateDialog.confirmDiscardTitle',
              'Discard draft?'
            )}
          </DialogTitle>
          <DialogDescription size="compact">
            {t(
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
            {t('auto.components.task.page.dart.TaskCreateDialog.cancel', 'Cancel')}
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
            {t('auto.components.task.page.dart.TaskCreateDialog.discardDraft', 'Discard draft')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
