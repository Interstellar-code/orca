import type { DartWriteResult } from '@/runtime/runtime-dart-write-client'
import { translate } from '@/i18n/i18n'

function notApplied(error: string): DartWriteResult<never> {
  return { ok: false, outcome: 'notApplied', error }
}

/** Refusals a create returns before anything is sent. */
export const dartCreateNotApplied = {
  errorAccountRequired: (): DartWriteResult<never> =>
    notApplied(
      translate(
        'auto.components.task.page.dart.TaskCreateDialog.errorAccountRequired',
        'A current Dart account is required.'
      )
    ),
  errorCheckingCapabilities: (): DartWriteResult<never> =>
    notApplied(
      translate(
        'auto.components.task.page.dart.TaskCreateDialog.errorCheckingCapabilities',
        'Checking Dart capabilities.'
      )
    ),
  errorReviewPrevious: (): DartWriteResult<never> =>
    notApplied(
      translate(
        'auto.components.task.page.dart.TaskCreateDialog.errorReviewPrevious',
        'Review the possible previous creation first.'
      )
    ),
  errorNeedsCheckedList: (): DartWriteResult<never> =>
    notApplied(
      translate(
        'auto.components.task.page.dart.TaskCreateDialog.errorNeedsCheckedList',
        'Create anyway needs a checked list.'
      )
    )
}
