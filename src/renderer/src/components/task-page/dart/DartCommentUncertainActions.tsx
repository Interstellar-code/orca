import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

export function DartCommentUncertainActions({
  reconciled,
  submitting,
  onResend,
  onPosted
}: {
  reconciled: boolean
  submitting: boolean
  onResend: () => void
  onPosted: () => void
}): React.JSX.Element {
  return (
    <>
      {reconciled ? (
        <Button type="button" variant="outline" size="xs" disabled={submitting} onClick={onResend}>
          {translate('auto.components.task.page.dart.DartCommentComposer.sendAgain', 'Send again')}
        </Button>
      ) : null}
      <Button type="button" variant="ghost" size="xs" onClick={onPosted}>
        {translate('auto.components.task.page.dart.DartCommentComposer.itPosted', 'It posted')}
      </Button>
    </>
  )
}
