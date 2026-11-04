import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type {
  DartConnectionStatus,
  DartTask,
  DartWorkspaceConfig
} from '../../../../../shared/dart/dart-types'
import { translate } from '@/i18n/i18n'
import { dartSupportsWritesV2ForTarget } from '@/runtime/runtime-dart-write-client'
import { useAppStore } from '@/store'
import { getDartReadScope } from '@/store/slices/dart/dart-read-coordination'
import { dartAccountIdentity, dartScopeViewerId } from '@/store/slices/dart/dart-task-identity'
import { EMPTY_DART_CREATE_SESSION } from '@/store/slices/task-creation-drafts'
import type { DartCreateDraft, DartCreateTaskModel } from './dart-detail-contracts'
import { dartCreateArgs, dartCreateRefusal } from './dart-create-request'
import { checkDartCreateSession, submitDartCreate } from './dart-create-submit'
import type { DartListFilters } from './task-page-dart-list-model'

export type TaskPageDartCreationInput = {
  taskSource?: string
  dartConnected: boolean
  dartUpdateRequired: boolean
  dartConfig: DartWorkspaceConfig | null
  dartFilters: DartListFilters
  dartStatus: DartConnectionStatus
  setDartRefreshNonce: (updater: (nonce: number) => number) => void
  noteDartTaskCreated: (task: DartTask) => void
  openDartDetailPage: (task: DartTask) => void
}

export function useTaskPageDartCreation<TModel extends TaskPageDartCreationInput>(
  model: TModel
): TModel & DartCreateTaskModel {
  const { dartConnected, dartUpdateRequired, dartConfig, dartFilters, dartStatus } = model
  const environmentId = useAppStore((state) => state.settings?.activeRuntimeEnvironmentId)
  const statusContextKey = useAppStore((state) => state.dartStatusContextKey)
  const scope = useMemo(
    () => getDartReadScope({ activeRuntimeEnvironmentId: environmentId }),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- Session generations decide which viewer is trusted.
    [environmentId, statusContextKey]
  )
  const viewerId = useAppStore((state) => dartScopeViewerId(state, scope))
  const identity = dartAccountIdentity(scope, viewerId)
  const key = JSON.stringify([identity.hostKey, identity.accountKey, 'create'])
  const session = useAppStore((state) => state.dartCreateSessions[key] ?? EMPTY_DART_CREATE_SESSION)
  const patchSession = useAppStore((state) => state.patchDartCreateSession)
  const clearSession = useAppStore((state) => state.clearDartCreateSession)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [createSupportsWritesV2, setCreateSupportsWritesV2] = useState(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setCreateSupportsWritesV2(false)
    if (model.taskSource === 'dart' && dartConnected) {
      void dartSupportsWritesV2ForTarget(scope.target).then((supported) => {
        if (!cancelled) {
          setCreateSupportsWritesV2(supported)
        }
      })
    }
    return () => {
      cancelled = true
    }
  }, [dartConnected, model.taskSource, scope])

  const createDraft = useMemo(() => {
    const board = dartFilters.dartboard ?? dartConfig?.dartboards[0] ?? ''
    return session.draft.dartboard || !board
      ? session.draft
      : { ...session.draft, dartboard: board }
  }, [dartConfig?.dartboards, dartFilters.dartboard, session.draft])
  const setCreateDraft = useCallback(
    (patch: Partial<DartCreateDraft>): void => {
      const current = useAppStore.getState().dartCreateSessions[key]?.draft ?? createDraft
      patchSession(key, { draft: { ...current, ...patch } })
    },
    [createDraft, key, patchSession]
  )
  const openCreate = useCallback((): void => {
    if (!dartConnected || dartUpdateRequired) {
      return
    }
    setCreateDraft({
      dartboard: createDraft.dartboard,
      assignee: createDraft.assignee || (dartFilters.mine ? (dartStatus.viewer?.name ?? '') : '')
    })
    setOpenKey(key)
  }, [
    createDraft,
    dartConnected,
    dartFilters.mine,
    dartStatus.viewer?.name,
    dartUpdateRequired,
    key,
    setCreateDraft
  ])
  const closeCreate = useCallback((): void => setOpenKey(null), [])
  const dismissCreateNotice = useCallback(
    (): void => patchSession(key, { notice: null }),
    [key, patchSession]
  )
  const dismissMatches = useCallback(
    (): void => patchSession(key, { matchesDismissed: true }),
    [key, patchSession]
  )
  const checkAgain = useCallback(async (): Promise<void> => {
    if (!useAppStore.getState().dartCreateSessions[key]?.lookingUp) {
      await checkDartCreateSession(key, scope)
    }
  }, [key, scope])
  const canCreateAnyway =
    session.unknown &&
    session.listChecked &&
    !session.lookingUp &&
    (session.matchesDismissed || (session.matches.length === 0 && !session.truncated))

  const submit = useCallback<DartCreateTaskModel['createTask']>(
    async (input) => {
      const title = typeof input.title === 'string' ? input.title.trim() : ''
      const board = typeof input.dartboard === 'string' ? input.dartboard : ''
      const refusal = dartCreateRefusal(
        title,
        typeof input.description === 'string' ? input.description : undefined,
        board,
        dartConfig
      )
      if (refusal) {
        patchSession(key, { notice: { kind: 'refused', message: refusal }, editable: true })
        return { ok: false, outcome: 'notApplied', error: refusal }
      }
      const args = { ...input, title, dartboard: board }
      if (!dartConfig?.types.length) {
        delete args.type
      }
      return submitDartCreate(args, {
        key,
        scope,
        onSuccess: (task) => {
          const state = useAppStore.getState()
          const activeScope = getDartReadScope(state.settings)
          const activeIdentity = dartAccountIdentity(
            activeScope,
            dartScopeViewerId(state, activeScope)
          )
          if (
            mounted.current &&
            state.activeView === 'tasks' &&
            identity.hostKey === activeIdentity.hostKey &&
            identity.accountKey === activeIdentity.accountKey
          ) {
            model.noteDartTaskCreated(task)
            model.setDartRefreshNonce((nonce) => nonce + 1)
            model.openDartDetailPage(task)
            setOpenKey(null)
          }
          toast.success(
            translate('auto.components.task.page.dart.TaskCreateDialog.created', 'Created')
          )
        }
      })
    },
    [dartConfig, identity.accountKey, identity.hostKey, key, model, patchSession, scope]
  )
  const createTask = useCallback<DartCreateTaskModel['createTask']>(
    async (input) => {
      if (useAppStore.getState().dartCreateSessions[key]?.unknown) {
        return {
          ok: false,
          outcome: 'notApplied',
          error: 'Review the possible previous creation first.'
        }
      }
      return submit(input)
    },
    [key, submit]
  )
  const createAnyway = useCallback<DartCreateTaskModel['createAnyway']>(async () => {
    const current = useAppStore.getState().dartCreateSessions[key]
    if (
      !current?.unknown ||
      !current.listChecked ||
      current.lookingUp ||
      !(current.matchesDismissed || (current.matches.length === 0 && !current.truncated))
    ) {
      return { ok: false, outcome: 'notApplied', error: 'Create anyway needs a checked list.' }
    }
    return submit(dartCreateArgs(current.draft, createSupportsWritesV2))
  }, [createSupportsWritesV2, key, submit])
  const claimCreateMatch = useCallback(
    (task: DartTask): void => {
      clearSession(key)
      setOpenKey(null)
      model.openDartDetailPage(task)
    },
    [clearSession, key, model]
  )
  const discardCreateDraft = useCallback((): void => {
    clearSession(key)
    setOpenKey(null)
  }, [clearSession, key])

  return Object.assign(model, {
    createOpen: openKey === key,
    createSupportsWritesV2,
    createSubmitting: session.submitting,
    openCreate,
    closeCreate,
    createTask,
    createDraft,
    setCreateDraft,
    createUnresolved: session.unknown,
    createFieldsLocked: session.unknown && !session.editable,
    createLookingUp: session.lookingUp,
    createNotice: session.notice,
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
