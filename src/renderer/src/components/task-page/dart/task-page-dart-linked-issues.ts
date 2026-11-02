import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import type { LinkedDartTaskRef } from '@/lib/dart-issue-workspace-attachment'
import { translate } from '@/i18n/i18n'
import { taskProviderErrorMessage } from '@/lib/task-provider-error-copy'
import { readLinkedTaskIssuesWithLimit } from '../../read-linked-task-issues'

type FetchDartTask = (
  taskId: string,
  options: { sourceContext?: TaskSourceContext | null; force: boolean }
) => Promise<
  { ok: true; task: DartTask } | { ok: false; error: string; errorCode?: string | undefined }
>

export type LinkedDartTasksResult = {
  tasks: DartTask[]
  error: { message: string; code?: string } | null
}

// Dart has no id-list query, so each linked task is read by id with bounded concurrency.
export async function readLinkedDartTasks(
  refs: readonly LinkedDartTaskRef[],
  fetchTask: FetchDartTask,
  sourceContext: TaskSourceContext | null | undefined,
  force: boolean
): Promise<LinkedDartTasksResult> {
  const results = await readLinkedTaskIssuesWithLimit(refs, async (ref) => {
    try {
      const result = await fetchTask(ref.taskId, {
        sourceContext: ref.sourceContext ?? sourceContext,
        force
      })
      return result.ok
        ? { task: result.task, error: null }
        : {
            task: null,
            error: {
              message: taskProviderErrorMessage(result),
              code: result.errorCode
            }
          }
    } catch {
      return { task: null, error: { message: '', code: undefined } }
    }
  })
  const firstError = results.find((result) => result?.error)?.error ?? null
  const someMissing = results.some((result) => !result?.task)
  return {
    tasks: results.flatMap((result) => (result?.task ? [result.task] : [])),
    error: firstError
      ? {
          message:
            firstError.message ||
            translate(
              'auto.components.task.page.dart.task.page.dart.linked.issues.someTasksFailed',
              'Some Dart tasks linked to workspaces could not be loaded. Refresh to try again.'
            ),
          ...(firstError.code ? { code: firstError.code } : {})
        }
      : someMissing
        ? {
            message: translate(
              'auto.components.task.page.dart.task.page.dart.linked.issues.someTasksFailed',
              'Some Dart tasks linked to workspaces could not be loaded. Refresh to try again.'
            )
          }
        : null
  }
}

export function filterLinkedDartTasks(tasks: readonly DartTask[], query: string): DartTask[] {
  const needle = query.trim().toLowerCase()
  return tasks.filter(
    (task) =>
      !needle ||
      [task.id, task.title, task.dartboard ?? '', task.assignee ?? ''].some((value) =>
        value.toLowerCase().includes(needle)
      )
  )
}
