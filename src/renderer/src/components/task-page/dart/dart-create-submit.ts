import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { DartCreateTaskArgs } from '../../../../../shared/rpc-contract/dart-params'
import { translate } from '@/i18n/i18n'
import { taskProviderErrorMessage } from '@/lib/task-provider-error-copy'
import { dartListTasksForTarget } from '@/runtime/runtime-dart-client'
import type { DartWriteResult } from '@/runtime/runtime-dart-write-client'
import { useAppStore } from '@/store'
import type { DartReadScope } from '@/store/slices/dart/dart-read-coordination'
import {
  dartAccountIdentity,
  dartScopeHostKey,
  dartScopeViewerId,
  UNKNOWN_DART_ACCOUNT
} from '@/store/slices/dart/dart-task-identity'

import { lookupDartCreateMatches } from './dart-create-lookup'
let lookupSequence = 0

function ownsDartCreateSession(key: string, scope: DartReadScope): boolean {
  const state = useAppStore.getState()
  const viewerId = dartScopeViewerId(state, scope)?.trim()
  if (!viewerId) {
    return false
  }
  const owners = state.dartCreateOwners[dartScopeHostKey(scope)]
  return owners?.activeOwner === viewerId && owners.keys[viewerId] === key
}

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
  const identity = dartAccountIdentity(scope, dartScopeViewerId(useAppStore.getState(), scope))
  if (!identity.accountKey || identity.accountKey === UNKNOWN_DART_ACCOUNT) {
    store.patchDartCreateSession(key, {
      lookingUp: false,
      listChecked: false,
      notice: {
        kind: 'unknown',
        message: translate(
          'auto.components.task.page.dart.TaskCreateDialog.accountNotReady',
          'No Dart account is selected. Switch back to the original account to check again.'
        )
      }
    })
    return
  }
  if (!ownsDartCreateSession(key, scope)) {
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
  try {
    const lookup = await lookupDartCreateMatches(
      (args) => {
        if (!ownsDartCreateSession(key, scope)) {
          throw new Error(
            'The Dart account changed. Return to the original account to check again.'
          )
        }
        return dartListTasksForTarget(scope.target, args)
      },
      draft.title.trim(),
      draft.dartboard
    )
    const latest = useAppStore.getState().dartCreateSessions[key]
    if (!latest || latest.lookupSequence !== sequence || !ownsDartCreateSession(key, scope)) {
      return
    }
    if ('error' in lookup) {
      store.patchDartCreateSession(key, {
        listChecked: false,
        matches: [],
        truncated: false,
        notice: { kind: 'unknown', message: lookup.error }
      })
    } else {
      store.patchDartCreateSession(key, {
        listChecked: true,
        matches: lookup.matches,
        truncated: lookup.truncated,
        notice:
          latest.notice?.kind === 'unknown'
            ? { kind: 'unknown', message: dartCreateUnknownMessage() }
            : latest.notice
      })
    }
  } catch (error) {
    const latest = useAppStore.getState().dartCreateSessions[key]
    if (!latest || latest.lookupSequence !== sequence || !ownsDartCreateSession(key, scope)) {
      return
    }
    store.patchDartCreateSession(key, {
      listChecked: false,
      matches: [],
      truncated: false,
      notice: {
        kind: 'unknown',
        message: translate(
          'auto.components.task.page.dart.TaskCreateDialog.lookupFailed',
          'Could not check whether Dart created this task. {{error}} Try again.',
          {
            error: taskProviderErrorMessage({
              error: error instanceof Error ? error.message : error
            })
          }
        )
      }
    })
  } finally {
    const latest = useAppStore.getState().dartCreateSessions[key]
    if (latest?.lookupSequence === sequence) {
      store.patchDartCreateSession(key, { lookingUp: false })
    }
  }
}

export async function submitDartCreate(
  args: DartCreateTaskArgs,
  deps: { key: string; scope: DartReadScope; onSuccess(task: DartTask): void }
): Promise<DartWriteResult<{ task: DartTask }>> {
  const store = useAppStore.getState()
  const current = store.dartCreateSessions[deps.key]
  const viewerId = dartScopeViewerId(store, deps.scope)
  if (!viewerId?.trim()) {
    if (current) {
      store.patchDartCreateSession(deps.key, {
        submitting: false,
        editable: false,
        listChecked: false,
        notice: {
          kind: 'unknown',
          message: translate(
            'auto.components.task.page.dart.TaskCreateDialog.accountNotReady',
            'No Dart account is selected. Switch back to the original account to create this task.'
          )
        }
      })
    }
    return { ok: false, outcome: 'notApplied', error: 'Dart account is not ready.' }
  }
  if (!current || !ownsDartCreateSession(deps.key, deps.scope)) {
    return { ok: false, outcome: 'notApplied', error: 'Dart create session is not active.' }
  }
  if (current.submitting) {
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
      lookupDraft: current?.draft
        ? {
            ...current.draft,
            title: String(args.title),
            dartboard: typeof args.dartboard === 'string' ? args.dartboard : '',
            assignee: typeof args.assignee === 'string' ? args.assignee : '',
            dueAt: typeof args.dueAt === 'string' ? args.dueAt : ''
          }
        : null,
      listChecked: false,
      matchesDismissed: false,
      notice: { kind: 'unknown', message: dartCreateUnknownMessage() }
    })
    if (ownsDartCreateSession(deps.key, deps.scope)) {
      await checkDartCreateSession(deps.key, deps.scope)
    }
  } else {
    store.patchDartCreateSession(deps.key, {
      submitting: false,
      editable: true,
      notice: { kind: 'refused', message: taskProviderErrorMessage(result) }
    })
  }
  return result
}
