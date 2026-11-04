import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { DartCreateTaskArgs } from '../../../../../shared/rpc-contract/dart-params'
import { taskProviderErrorMessage } from '@/lib/task-provider-error-copy'
import type { DartWriteResult } from '@/runtime/runtime-dart-write-client'

type SubmitDeps = {
  create(args: DartCreateTaskArgs): Promise<DartWriteResult<{ task: DartTask }>>
  contextKey: string
  finishCreate(task: DartTask, contextKey: string): void
  refuseCreate(message: string, field?: string): void
  reportUnknownOutcome(): Promise<void>
}

export async function submitDartCreate(
  args: DartCreateTaskArgs,
  deps: SubmitDeps
): Promise<DartWriteResult<{ task: DartTask }>> {
  const result = await deps.create(args)
  if (result.ok) {
    deps.finishCreate(result.task, deps.contextKey)
    return result
  }
  if (result.outcome === 'unknown') {
    await deps.reportUnknownOutcome()
    return result
  }
  deps.refuseCreate(taskProviderErrorMessage(result))
  return result
}
