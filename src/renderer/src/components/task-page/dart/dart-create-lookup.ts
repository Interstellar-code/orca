import type { DartTask } from '../../../../../shared/dart/dart-types'
import { taskProviderErrorMessage } from '@/lib/task-provider-error-copy'
import { translate } from '@/i18n/i18n'
import { dartCreateMatches } from './dart-create-request'

type ListResult = { ok: boolean; tasks?: DartTask[]; totalCount?: number; error?: string }

// ponytail: keeps the creation hook under the 300-line cap; move more here only if it grows again.
export async function lookupDartCreateMatches(
  list: (args: { title: string; dartboard?: string; limit: number }) => Promise<ListResult>,
  title: string,
  dartboard: string
): Promise<{ matches: DartTask[]; truncated: boolean } | { error: string }> {
  const result = await list({ title, ...(dartboard ? { dartboard } : {}), limit: 100 })
  if (!result.ok) {
    return {
      error: translate(
        'auto.components.task.page.dart.TaskCreateDialog.lookupFailed',
        'Could not check whether Dart created this task. {{error}} Try again.',
        { error: taskProviderErrorMessage(result) }
      )
    }
  }
  return dartCreateMatches(title, result.tasks ?? [], result.totalCount)
}
