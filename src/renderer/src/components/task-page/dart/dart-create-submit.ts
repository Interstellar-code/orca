import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { DartCreateTaskArgs } from '../../../../../shared/rpc-contract/dart-params'
import { translate } from '@/i18n/i18n'
import { taskProviderErrorMessage } from '@/lib/task-provider-error-copy'
import { dartListTasksForTarget } from '@/runtime/runtime-dart-client'
import type { DartWriteResult } from '@/runtime/runtime-dart-write-client'
import { useAppStore } from '@/store'
import { getDartReadScope } from '@/store/slices/dart/dart-read-coordination'
import type { DartReadScope } from '@/store/slices/dart/dart-read-coordination'
import {
  dartAccountIdentity,
  dartScopeHostKey,
  dartScopeViewerId,
  registerDartCacheAlias,
  UNKNOWN_DART_ACCOUNT
} from '@/store/slices/dart/dart-task-identity'

import { lookupDartCreateMatches } from './dart-create-lookup'

let lookupSequence = 0

let watchingSessions = false

function watchDartCreateSessions(): void {
  if (watchingSessions) {
    return
  }
  watchingSessions = true
  useAppStore.subscribe((state, previous) => {
    const scope = getDartReadScope(state.settings)
    const previousScope = getDartReadScope(previous.settings)
    const ownerChanged =
      scope.contextKey !== previousScope.contextKey ||
      dartScopeViewerId(state, scope) !== dartScopeViewerId(previous, previousScope) ||
      state.dartStatus.connected !== previous.dartStatus.connected ||
      Object.keys(state.dartCreateOwners).some(
        (host) =>
          state.dartCreateOwners[host]?.activeOwner !== previous.dartCreateOwners[host]?.activeOwner
      )
    for (const [key, session] of Object.entries(state.dartCreateSessions)) {
      const old = previous.dartCreateSessions[key]
      if (
        old &&
        (ownerChanged || old.draft !== session.draft) &&
        (session.listChecked || session.lookingUp)
      ) {
        state.patchDartCreateSession(key, {
          listChecked: false,
          lookingUp: false,
          lookupSequence: ++lookupSequence,
          matchesDismissed: false
        })
      }
    }
  })
}

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
  watchDartCreateSessions()
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
  const attempts = [
    ...(current.sentAttempts ?? []),
    current.lookupDraft ?? current.draft,
    current.draft
  ]
  const pairs = attempts.filter(
    (attempt, index) =>
      attempts.findIndex(
        (other) =>
          other.title.trim() === attempt.title.trim() && other.dartboard === attempt.dartboard
      ) === index
  )
  try {
    const matches = new Map<string, DartTask>()
    let truncated = false
    let lookupError: string | null = null
    for (const attempt of pairs) {
      const latest = useAppStore.getState().dartCreateSessions[key]
      if (!latest || latest.lookupSequence !== sequence || !ownsDartCreateSession(key, scope)) {
        return
      }
      const lookup = await lookupDartCreateMatches(
        (args) => {
          if (!ownsDartCreateSession(key, scope)) {
            throw new Error(
              translate(
                'auto.components.task.page.dart.TaskCreateDialog.errorAccountChanged',
                'The Dart account changed. Return to the original account to check again.'
              )
            )
          }
          return dartListTasksForTarget(scope.target, args)
        },
        attempt.title.trim(),
        attempt.dartboard
      )
      if ('error' in lookup) {
        lookupError ??= lookup.error
        continue
      }
      for (const task of lookup.matches) {
        matches.set(task.id, task)
      }
      truncated ||= lookup.truncated
    }
    const latest = useAppStore.getState().dartCreateSessions[key]
    if (!latest || latest.lookupSequence !== sequence || !ownsDartCreateSession(key, scope)) {
      return
    }
    store.patchDartCreateSession(key, {
      listChecked: !lookupError,
      matches: lookupError ? [] : [...matches.values()],
      truncated: lookupError ? false : truncated,
      notice: lookupError
        ? { kind: 'unknown', message: lookupError }
        : latest.notice?.kind === 'unknown'
          ? { kind: 'unknown', message: dartCreateUnknownMessage() }
          : latest.notice
    })
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
            'No Dart account is selected. Switch back to the original account to check again.'
          )
        }
      })
    }
    return {
      ok: false,
      outcome: 'notApplied',
      error: translate(
        'auto.components.task.page.dart.TaskCreateDialog.errorAccountNotReady',
        'Dart account is not ready.'
      )
    }
  }
  if (!current || !ownsDartCreateSession(deps.key, deps.scope)) {
    return {
      ok: false,
      outcome: 'notApplied',
      error: translate(
        'auto.components.task.page.dart.TaskCreateDialog.errorSessionNotActive',
        'Dart create session is not active.'
      )
    }
  }
  if (current.submitting) {
    return {
      ok: false,
      outcome: 'notApplied',
      error: translate(
        'auto.components.task.page.dart.TaskCreateDialog.errorCreateRunning',
        'A Dart create is already running.'
      )
    }
  }
  const attempt = {
    title: String(args.title),
    dartboard: typeof args.dartboard === 'string' ? args.dartboard : ''
  }
  store.patchDartCreateSession(deps.key, {
    submitting: true,
    notice: null,
    listChecked: false
  })
  // Pinned scope skips the store's own alias registration, and the create's list invalidation needs it.
  registerDartCacheAlias(deps.scope, viewerId)
  const result = await store.createDartTask(args, { scope: deps.scope })
  if (result.ok) {
    store.clearDartCreateSession(deps.key)
    deps.onSuccess(result.task)
  } else if (result.outcome === 'unknown') {
    const latest = useAppStore.getState().dartCreateSessions[deps.key]
    if (!latest) {
      return result
    }
    store.patchDartCreateSession(deps.key, {
      unknown: true,
      submitting: false,
      editable: false,
      draft: { ...latest.draft, dartboard: attempt.dartboard },
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
      sentAttempts: [...(latest.sentAttempts ?? []), attempt],
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
