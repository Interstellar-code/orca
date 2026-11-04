import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { DartCreateTaskArgs } from '../../../../../shared/rpc-contract/dart-params'
import { translate } from '@/i18n/i18n'
import { taskProviderErrorMessage } from '@/lib/task-provider-error-copy'
import { dartListTasksForTarget } from '@/runtime/runtime-dart-client'
import type { DartWriteResult } from '@/runtime/runtime-dart-write-client'
import { useAppStore } from '@/store'
import type { DartReadScope } from '@/store/slices/dart/dart-read-coordination'
import { lookupDartCreateMatches } from './dart-create-lookup'

let lookupSequence = 0

export function dartCreateUnknownMessage(): string {
  return translate(
    'auto.components.task.page.dart.TaskCreateDialog.mayHaveCreated',
    'Dart may have created this task. Check these before creating it again.'
  )
}

export async function checkDartCreateSession(key: string, scope: DartReadScope): Promise<void> {
  const store = useAppStore.getState()
  const current = store.dartCreateSessions[key]
  if (!current) {
    return
  }
  const sequence = ++lookupSequence
  store.patchDartCreateSession(key, {
    lookupSequence: sequence,
    lookingUp: true,
    listChecked: false,
    matchesDismissed: false
  })
  const draft = current.lookupDraft ?? current.draft
  const lookup = await lookupDartCreateMatches(
    (args) => dartListTasksForTarget(scope.target, args),
    draft.title.trim(),
    draft.dartboard
  )
  const latest = useAppStore.getState().dartCreateSessions[key]
  if (!latest || latest.lookupSequence !== sequence) {
    return
  }
  if ('error' in lookup) {
    store.patchDartCreateSession(key, {
      lookingUp: false,
      listChecked: false,
      matches: [],
      truncated: false,
      notice: { kind: 'unknown', message: lookup.error }
    })
  } else {
    store.patchDartCreateSession(key, {
      lookingUp: false,
      listChecked: true,
      matches: lookup.matches,
      truncated: lookup.truncated,
      notice:
        latest.notice?.kind === 'unknown'
          ? { kind: 'unknown', message: dartCreateUnknownMessage() }
          : latest.notice
    })
  }
}

export async function submitDartCreate(
  args: DartCreateTaskArgs,
  deps: { key: string; scope: DartReadScope; onSuccess(task: DartTask): void }
): Promise<DartWriteResult<{ task: DartTask }>> {
  const store = useAppStore.getState()
  const current = store.dartCreateSessions[deps.key]
  if (current?.submitting) {
    return { ok: false, outcome: 'notApplied', error: 'A Dart create is already running.' }
  }
  store.patchDartCreateSession(deps.key, { submitting: true, notice: null, listChecked: false })
  const result = await store.createDartTask(args)
  if (result.ok) {
    store.clearDartCreateSession(deps.key)
    deps.onSuccess(result.task)
  } else if (result.outcome === 'unknown') {
    store.patchDartCreateSession(deps.key, {
      unknown: true,
      submitting: false,
      editable: false,
      lookupDraft: current?.draft ?? null,
      listChecked: false,
      matchesDismissed: false,
      notice: { kind: 'unknown', message: dartCreateUnknownMessage() }
    })
    await checkDartCreateSession(deps.key, deps.scope)
  } else {
    store.patchDartCreateSession(deps.key, {
      submitting: false,
      editable: true,
      notice: { kind: 'refused', message: taskProviderErrorMessage(result) }
    })
  }
  return result
}
