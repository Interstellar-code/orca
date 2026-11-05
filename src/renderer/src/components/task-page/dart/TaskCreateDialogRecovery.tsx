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
  | 'canCreateAnyway'
  | 'claimCreateMatch'
  | 'discardCreateDraft'
> & {
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
  createNotice,
  createUnresolved,
  createMatches,
  createMatchesTruncated,
  createLookingUp,
  createFieldsLocked,
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
  if (!createNotice && !createUnresolved) {
    return null
  }

  return (
    <div className="flex flex-col gap-2">
      {createNotice ? (
        <DartTaskDetailNotice
          notice={createNotice}
          dismissNotice={dismissCreateNotice}
          recheckDisabled={recoveryBlocked}
          recheckNotice={checkAgain}
        />
      ) : null}
      {createUnresolved && !createNotice ? (
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
            {createLookingUp || createFieldsLocked ? (
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
                onClick={() => {
                  closeCreate()
                  openDartDetailPage(match)
                }}
              >
                <span className="truncate">{match.title}</span>
              </Button>
              <Button disabled={createSubmitting} onClick={() => claimCreateMatch?.(match)}>
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
