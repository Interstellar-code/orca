import { LoaderCircle } from 'lucide-react'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { DartTaskDetailNotice } from './TaskDetailNotice'
import type { DartCreateDialogModel } from './TaskCreateDialog'

type TaskCreateDialogRecoveryProps = Pick<
  DartCreateDialogModel,
  | 'createNotice'
  | 'createUnresolved'
  | 'createMatches'
  | 'createMatchesTruncated'
  | 'createLookingUp'
  | 'createFieldsLocked'
  | 'accountChecking'
  | 'retryAccountCheck'
  | 'createWritesV2Pending'
  | 'canCreateAnyway'
  | 'claimCreateMatch'
  | 'discardCreateDraft'
> & {
  createTokenRejected?: boolean
  createSubmitting: boolean
  recoveryBlocked: boolean
  listChecked: boolean
  closeCreate: () => void
  dismissCreateNotice: () => void
  checkAgain: () => Promise<void>
  dismissMatches: () => void
  createAnyway: () => void
  openDartDetailPage: (task: DartTask) => void
  onDiscard: () => void
}

export function TaskCreateDialogRecovery({
  createTokenRejected,
  createNotice,
  createUnresolved,
  createMatches,
  createMatchesTruncated,
  createLookingUp,
  accountChecking,
  retryAccountCheck,
  createWritesV2Pending,
  canCreateAnyway,
  claimCreateMatch,
  createSubmitting,
  recoveryBlocked,
  listChecked,
  closeCreate,
  dismissCreateNotice,
  checkAgain,
  dismissMatches,
  createAnyway,
  openDartDetailPage,
  onDiscard
}: TaskCreateDialogRecoveryProps): React.JSX.Element | null {
  if (
    !createTokenRejected &&
    !createNotice &&
    !createUnresolved &&
    !accountChecking &&
    !createWritesV2Pending
  ) {
    return null
  }

  return (
    <div className="flex flex-col gap-2">
      {createTokenRejected ? (
        <p role="alert" className="text-xs text-destructive">
          {translate(
            'auto.components.task.page.dart.TaskCreateDialog.tokenRejected',
            'Dart rejected your token. Reconnect to Dart and try again.'
          )}
        </p>
      ) : null}
      {createWritesV2Pending ? (
        <p role="status" className="text-xs text-muted-foreground">
          {translate(
            'auto.components.task.page.dart.TaskCreateDialog.checkingCapabilities',
            'Checking Dart capabilities before creating this task.'
          )}
        </p>
      ) : null}
      {accountChecking ? (
        <div role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="min-w-0 flex-1">
            {translate(
              'auto.components.task.page.dart.TaskCreateDialog.checkingAccount',
              'Checking your Dart account.'
            )}
          </span>
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={createSubmitting}
            onClick={() => void retryAccountCheck?.()}
          >
            {translate('auto.components.task.page.dart.TaskCreateDialog.retryAccount', 'Retry')}
          </Button>
        </div>
      ) : null}
      {createNotice && (!accountChecking || createNotice.kind !== 'unknown') ? (
        <DartTaskDetailNotice
          notice={createNotice}
          dismissNotice={dismissCreateNotice}
          recheckDisabled={recoveryBlocked}
          recheckNotice={checkAgain}
        />
      ) : null}
      {createUnresolved && createNotice?.kind !== 'unknown' && !accountChecking ? (
        <div className="flex items-center gap-2">
          <p role="status" className="min-w-0 flex-1 text-xs text-muted-foreground">
            {translate(
              'auto.components.task.page.dart.TaskCreateDialog.noticeHidden',
              'Dart may have created this task. Check before creating it again.'
            )}
          </p>
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={recoveryBlocked}
            onClick={() => void checkAgain()}
          >
            {createLookingUp ? (
              <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />
            ) : null}
            {translate('auto.components.task.page.dart.TaskCreateDialog.checkAgain', 'Check again')}
          </Button>
        </div>
      ) : null}
      {createMatches.length ? (
        <ul className="flex flex-col gap-1 rounded-md border border-border/50 p-2 text-xs">
          {createMatches.map((match) => (
            <li key={match.id} className="flex items-center gap-2">
              <Button
                type="button"
                variant="link"
                size="xs"
                className="min-w-0 justify-start"
                disabled={createSubmitting || accountChecking}
                onClick={() => {
                  closeCreate()
                  openDartDetailPage(match)
                }}
              >
                <span className="truncate">{match.title}</span>
              </Button>
              <Button
                disabled={createSubmitting || accountChecking}
                onClick={() => claimCreateMatch?.(match)}
              >
                {translate(
                  'auto.components.task.page.dart.TaskCreateDialog.thisIsMine',
                  'This is mine'
                )}
              </Button>
              <span className="text-2xs text-muted-foreground">{match.status}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {createMatchesTruncated ? (
        <p className="text-2xs text-muted-foreground">
          {translate(
            'auto.components.task.page.dart.TaskCreateDialog.truncated',
            'More tasks exist. Review them in Dart before creating another task.'
          )}
        </p>
      ) : null}
      {createUnresolved ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={createSubmitting}
          onClick={onDiscard}
        >
          {translate(
            'auto.components.task.page.dart.TaskCreateDialog.discardDraft',
            'Discard draft'
          )}
        </Button>
      ) : null}
      {listChecked && (createMatches.length > 0 || createMatchesTruncated) && !canCreateAnyway ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={recoveryBlocked}
          onClick={dismissMatches}
        >
          {translate(
            'auto.components.task.page.dart.TaskCreateDialog.noneMine',
            'None of these is mine'
          )}
        </Button>
      ) : null}
      {canCreateAnyway ? (
        <Button
          type="button"
          size="sm"
          disabled={recoveryBlocked}
          onClick={() => void createAnyway()}
        >
          {translate(
            'auto.components.task.page.dart.TaskCreateDialog.createAnyway',
            'Create anyway'
          )}
        </Button>
      ) : null}
    </div>
  )
}
