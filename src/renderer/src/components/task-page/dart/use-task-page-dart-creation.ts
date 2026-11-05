import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { useAppStore } from '@/store'
import { getDartReadScope } from '@/store/slices/dart/dart-read-coordination'
import { dartScopeHostKey, dartScopeViewerId } from '@/store/slices/dart/dart-task-identity'
import { EMPTY_DART_CREATE_SESSION } from '@/store/slices/task-creation-drafts'
import type { DartCreateTaskModel } from './dart-detail-contracts'
import { dartCreateArgs, dartCreateRefusal } from './dart-create-request'
import { checkDartCreateSession, submitDartCreate } from './dart-create-submit'
import type { DartCreateExtras, TaskPageDartCreationInput } from './dart-create-submit'
import {
  useDartCreateAccountCheck,
  useDartCreateCapabilities,
  useDartCreateDiscardActions,
  useDartCreateDraft,
  useDartCreateMounted,
  useDartCreateOpen,
  useDartCreateOpenKey
} from './use-dart-create-state'
export type { TaskPageDartCreationInput } from './dart-create-submit'
export function useTaskPageDartCreation<TModel extends TaskPageDartCreationInput>(
  model: TModel
): TModel & DartCreateTaskModel & DartCreateExtras {
  const { dartConnected, dartUpdateRequired, dartConfig, dartFilters, dartStatus } = model
  const { setDartRefreshNonce, noteDartTaskCreated, openDartDetailPage } = model
  const [tokenRejection, setTokenRejection] = useState<{ host: string; owner: string } | null>(null)
  const environmentId = useAppStore((state) => state.settings?.activeRuntimeEnvironmentId)
  const contextKey = useAppStore((state) => getProviderRuntimeContextKey(state.settings))
  const scope = useMemo(
    () => getDartReadScope({ activeRuntimeEnvironmentId: environmentId }),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- The context includes runtime session generation.
    [environmentId, contextKey]
  )
  const hostKey = dartScopeHostKey(scope)
  const ownerUserId = useAppStore((state) => dartScopeViewerId(state, scope))
  const hasCurrentViewer = useCallback(() => {
    const state = useAppStore.getState()
    const currentScope = getDartReadScope(state.settings)
    return Boolean(
      ownerUserId &&
      currentScope.contextKey === scope.contextKey &&
      dartScopeViewerId(state, currentScope) === ownerUserId
    )
  }, [ownerUserId, scope])
  const ownerRecord = useAppStore((state) => state.dartCreateOwners[hostKey])
  const unknownKey = JSON.stringify([hostKey, 'create', null])
  const hasUnknownSession = useAppStore((state) => Boolean(state.dartCreateSessions[unknownKey]))
  const key = ownerUserId
    ? (ownerRecord?.keys[ownerUserId] ??
      (!ownerRecord?.activeOwner && hasUnknownSession
        ? unknownKey
        : JSON.stringify([hostKey, 'create', ownerUserId])))
    : (ownerRecord?.activeOwner && ownerRecord.keys[ownerRecord.activeOwner]) || unknownKey
  const session = useAppStore((state) =>
    ownerUserId
      ? (state.dartCreateSessions[key] ?? EMPTY_DART_CREATE_SESSION)
      : EMPTY_DART_CREATE_SESSION
  )
  const patchSession = useAppStore((state) => state.patchDartCreateSession)
  const setDartCreateOwner = useAppStore((state) => state.setDartCreateOwner)
  useLayoutEffect(() => {
    if (ownerUserId && hasCurrentViewer()) {
      setDartCreateOwner(hostKey, ownerUserId, key)
    }
  }, [hasCurrentViewer, hostKey, key, ownerUserId, setDartCreateOwner])
  const activeKey = useRef(key)
  activeKey.current = key
  const [openKey, setOpenKey] = useDartCreateOpenKey(key, hostKey, ownerUserId, unknownKey)
  const { createSupportsWritesV2, createWritesV2Pending } = useDartCreateCapabilities(
    model.taskSource,
    dartConnected,
    scope
  )
  const mounted = useDartCreateMounted()
  const { createDraft, setCreateDraft } = useDartCreateDraft(
    key,
    session.draft,
    dartFilters.dartboard,
    dartConfig?.dartboards
  )
  const openCreate = useDartCreateOpen(
    key,
    createDraft,
    setCreateDraft,
    setOpenKey,
    dartConnected,
    dartUpdateRequired,
    dartFilters.mine,
    ownerUserId,
    dartStatus.viewer?.name
  )
  const closeCreate = useCallback((): void => setOpenKey(null), [setOpenKey])
  const dismissCreateNotice = useCallback(
    (): void => patchSession(key, { notice: null }),
    [key, patchSession]
  )
  const dismissMatches = useCallback((): void => {
    if (hasCurrentViewer()) {
      patchSession(key, { matchesDismissed: true })
    }
  }, [hasCurrentViewer, key, patchSession])
  const checkAgain = useCallback(async (): Promise<void> => {
    if (!hasCurrentViewer()) {
      return
    }
    if (
      dartConfig &&
      !model.dartConfigError &&
      !useAppStore.getState().dartCreateSessions[key]?.lookingUp
    ) {
      await checkDartCreateSession(key, scope)
    }
  }, [dartConfig, hasCurrentViewer, model.dartConfigError, key, scope])
  const canCreateAnyway =
    Boolean(ownerUserId) &&
    !createWritesV2Pending &&
    Boolean(dartConfig) &&
    !model.dartConfigError &&
    session.unknown &&
    session.listChecked &&
    !session.lookingUp &&
    (session.matchesDismissed || (session.matches.length === 0 && !session.truncated))
  const submit = useCallback<DartCreateTaskModel['createTask']>(
    async (input) => {
      if (!hasCurrentViewer()) {
        return { ok: false, outcome: 'notApplied', error: 'A current Dart account is required.' }
      }
      const title = typeof input.title === 'string' ? input.title.trim() : ''
      if (createWritesV2Pending) {
        return { ok: false, outcome: 'notApplied', error: 'Checking Dart capabilities.' }
      }
      const board = typeof input.dartboard === 'string' ? input.dartboard : ''
      const refusal = dartCreateRefusal(
        title,
        typeof input.description === 'string' ? input.description : undefined,
        board,
        dartConfig
      )
      if (refusal) {
        patchSession(key, {
          notice: { kind: 'refused', message: refusal },
          editable: true,
          listChecked: false
        })
        return { ok: false, outcome: 'notApplied', error: refusal }
      }
      const args = { ...input, title, dartboard: board }
      if (!dartConfig?.types.length) {
        delete args.type
      }
      if (!createSupportsWritesV2 && (input.dueAt || createDraft.dueAt)) {
        const error = 'A due date requires Dart writes v2, which is unavailable.'
        patchSession(key, {
          notice: { kind: 'refused', message: error },
          editable: true,
          listChecked: false
        })
        return { ok: false, outcome: 'notApplied', error }
      }
      setTokenRejection(null)
      const result = await submitDartCreate(args, {
        key,
        scope,
        onSuccess: (task) => {
          const state = useAppStore.getState()
          const activeScope = getDartReadScope(state.settings)
          const activeHostKey = dartScopeHostKey(activeScope)
          if (
            mounted.current &&
            state.activeView === 'tasks' &&
            hostKey === activeHostKey &&
            dartScopeViewerId(state, activeScope) === ownerUserId &&
            activeKey.current === key
          ) {
            noteDartTaskCreated(task)
            setDartRefreshNonce((nonce) => nonce + 1)
            openDartDetailPage(task)
            setOpenKey(null)
          }
          if (mounted.current) {
            setOpenKey((current) => (current === key ? null : current))
          }
          toast.success(
            translate('auto.components.task.page.dart.TaskCreateDialog.created', 'Created')
          )
        }
      })
      if (!result.ok && result.errorCode === 'dart.unauthorized' && ownerUserId) {
        setTokenRejection({ host: hostKey, owner: ownerUserId })
      }
      return result
    },
    [
      createSupportsWritesV2,
      createDraft.dueAt,
      createWritesV2Pending,
      dartConfig,
      hasCurrentViewer,
      hostKey,
      key,
      mounted,
      noteDartTaskCreated,
      openDartDetailPage,
      ownerUserId,
      patchSession,
      scope,
      setOpenKey,
      setDartRefreshNonce
    ]
  )
  const createTask = useCallback<DartCreateTaskModel['createTask']>(
    async (input) => {
      if (!hasCurrentViewer()) {
        return { ok: false, outcome: 'notApplied', error: 'A current Dart account is required.' }
      }
      if (useAppStore.getState().dartCreateSessions[key]?.unknown) {
        return {
          ok: false,
          outcome: 'notApplied',
          error: 'Review the possible previous creation first.'
        }
      }
      return submit(input)
    },
    [hasCurrentViewer, key, submit]
  )
  const createAnyway = useCallback<DartCreateTaskModel['createAnyway']>(async () => {
    if (!hasCurrentViewer()) {
      return { ok: false, outcome: 'notApplied', error: 'A current Dart account is required.' }
    }
    if (createWritesV2Pending) {
      return { ok: false, outcome: 'notApplied', error: 'Checking Dart capabilities.' }
    }
    const current = useAppStore.getState().dartCreateSessions[key]
    if (
      !dartConfig ||
      model.dartConfigError ||
      !current?.unknown ||
      !current.listChecked ||
      current.lookingUp ||
      !(current.matchesDismissed || (current.matches.length === 0 && !current.truncated))
    ) {
      return { ok: false, outcome: 'notApplied', error: 'Create anyway needs a checked list.' }
    }
    return submit(
      dartCreateArgs(
        { ...current.draft, dartboard: current.draft.dartboard || createDraft.dartboard },
        true
      )
    )
  }, [
    dartConfig,
    model.dartConfigError,
    createWritesV2Pending,
    hasCurrentViewer,
    key,
    submit,
    createDraft.dartboard
  ])
  const { claimCreateMatch, discardCreateDraft } = useDartCreateDiscardActions(
    key,
    hasCurrentViewer,
    setOpenKey,
    openDartDetailPage
  )
  const { retryAccountCheck, accountCheckNotice } = useDartCreateAccountCheck()
  return Object.assign({}, model, {
    createOpen: openKey === key,
    createSupportsWritesV2,
    createWritesV2Pending,
    createTokenRejected:
      tokenRejection?.host === hostKey && (!ownerUserId || tokenRejection.owner === ownerUserId),
    createSubmitting: session.submitting,
    openCreate,
    closeCreate,
    createTask,
    createDraft: ownerUserId ? createDraft : EMPTY_DART_CREATE_SESSION.draft,
    setCreateDraft,
    createUnresolved: session.unknown,
    createFieldsLocked: (session.unknown && !session.editable) || !ownerUserId,
    createLookingUp: session.lookingUp,
    createNotice: session.notice ?? (!ownerUserId ? accountCheckNotice : null),
    accountChecking: !ownerUserId,
    retryAccountCheck,
    listChecked: session.listChecked,
    createMatches: session.matches,
    createMatchesTruncated: session.truncated,
    canCreateAnyway,
    dismissCreateNotice,
    checkAgain,
    dismissMatches,
    createAnyway,
    claimCreateMatch,
    discardCreateDraft
  })
}
