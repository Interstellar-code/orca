import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type {
  DartConnectionStatus,
  DartTask,
  DartWorkspaceConfig
} from '../../../../../shared/dart/dart-types'
import type { DartCreateTaskArgs } from '../../../../../shared/rpc-contract/dart-params'
import { translate } from '@/i18n/i18n'
import { dartSupportsWritesV2ForTarget } from '@/runtime/runtime-dart-write-client'
import { useAppStore } from '@/store'
import { getDartReadScope } from '@/store/slices/dart/dart-read-coordination'
import type { DartCreateDraft, DartCreateTaskModel, DartWriteNotice } from './dart-detail-contracts'
import { dartCreateArgs, dartCreateRefusal, EMPTY_DART_CREATE_DRAFT } from './dart-create-request'
import { lookupDartCreateMatches } from './dart-create-lookup'
import { submitDartCreate } from './dart-create-submit'
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

const MAY_HAVE_CREATED_MESSAGE = 'auto.components.task.page.dart.TaskCreateDialog.mayHaveCreated'

export function useTaskPageDartCreation<TModel extends TaskPageDartCreationInput>(
  model: TModel
): TModel & DartCreateTaskModel {
  const { dartConnected, dartUpdateRequired, dartConfig, dartFilters, dartStatus } = model
  const { setDartRefreshNonce, noteDartTaskCreated, openDartDetailPage } = model
  const settings = useAppStore((s) => s.settings)

  const [createOpen, setCreateOpen] = useState(false)
  const [createDraftState, setCreateDraftState] = useState<DartCreateDraft>(EMPTY_DART_CREATE_DRAFT)
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [createNotice, setCreateNotice] = useState<DartWriteNotice | null>(null)
  const [listChecked, setListChecked] = useState(false)
  const [createMatches, setCreateMatches] = useState<readonly DartTask[]>([])
  const [createMatchesTruncated, setCreateMatchesTruncated] = useState(false)
  const [matchesDismissed, setMatchesDismissed] = useState(false)
  const [createSupportsWritesV2, setCreateSupportsWritesV2] = useState(false)
  // A ref, not the state: two clicks in one tick would both read the same stale `false`.
  const createInFlightRef = useRef(false)
  const unknownRef = useRef(false)
  const lookupSequenceRef = useRef(0)
  const [unknown, setUnknown] = useState(false)
  const [lookingUp, setLookingUp] = useState(false)

  // A date-only value needs `dart.writes.v2`; an old host would refuse it, so the field stays hidden.
  useEffect(() => {
    if (model.taskSource !== 'dart' || !dartConnected) {
      return
    }
    let cancelled = false
    const scope = getDartReadScope(settings, null)
    void dartSupportsWritesV2ForTarget(scope.target).then((supported) => {
      if (!cancelled) {
        setCreateSupportsWritesV2(supported)
      }
    })
    return () => {
      cancelled = true
    }
  }, [dartConnected, model.taskSource, settings])

  const createDraft = useMemo(() => {
    const board = dartFilters.dartboard ?? dartConfig?.dartboards[0] ?? ''
    return createDraftState.dartboard || !board
      ? createDraftState
      : { ...createDraftState, dartboard: board }
  }, [createDraftState, dartConfig?.dartboards, dartFilters.dartboard])
  const setCreateDraft = useCallback((patch: Partial<DartCreateDraft>) => {
    setCreateDraftState((current) => ({ ...current, ...patch }))
  }, [])

  const openCreate = useCallback(() => {
    if (!dartConnected || dartUpdateRequired) {
      return
    }
    const boards = dartConfig?.dartboards ?? []
    setCreateOpen(true)
    setCreateDraftState((current) => ({
      ...current,
      // A board of another host's config is not this host's board.
      dartboard:
        current.dartboard && boards.includes(current.dartboard)
          ? current.dartboard
          : (dartFilters.dartboard ?? boards[0] ?? ''),
      assignee: current.assignee || (dartFilters.mine ? (dartStatus.viewer?.name ?? '') : '')
    }))
  }, [
    dartConfig?.dartboards,
    dartConnected,
    dartFilters.dartboard,
    dartFilters.mine,
    dartStatus.viewer?.name,
    dartUpdateRequired
  ])

  const closeCreate = useCallback(() => {
    setCreateOpen(false)
  }, [])

  const dismissCreateNotice = useCallback(() => {
    setCreateNotice(null)
    if (unknownRef.current) {
      setCreateMatches([])
    }
  }, [])

  const dismissMatches = useCallback(() => {
    setMatchesDismissed(true)
  }, [])

  const checkAgain = useCallback(async (): Promise<void> => {
    const title = createDraft.title.trim()
    if (!title) {
      return
    }
    const sequence = ++lookupSequenceRef.current
    setLookingUp(true)
    setListChecked(false)
    const lookup = await lookupDartCreateMatches(
      (args) => useAppStore.getState().listDartTasks(args, { force: true }),
      title,
      createDraft.dartboard
    )
    if (sequence !== lookupSequenceRef.current) {
      return
    }
    setLookingUp(false)
    if ('error' in lookup) {
      setCreateNotice({ kind: 'unknown', message: lookup.error })
      setListChecked(false)
      setCreateMatches([])
      setCreateMatchesTruncated(false)
      setMatchesDismissed(false)
      return
    }
    setCreateMatches(lookup.matches)
    setCreateMatchesTruncated(lookup.truncated)
    setListChecked(true)
    setMatchesDismissed(false)
  }, [createDraft.dartboard, createDraft.title])

  /** Only a checked list proves "no match"; a listed match needs the user's own word. */
  const canCreateAnyway = useMemo(
    () =>
      listChecked &&
      unknown &&
      !lookingUp &&
      (matchesDismissed || (createMatches.length === 0 && !createMatchesTruncated)),
    [
      createMatches.length,
      createMatchesTruncated,
      unknown,
      lookingUp,
      listChecked,
      matchesDismissed
    ]
  )

  const finishCreate = useCallback(
    (task: DartTask, contextKey: string): void => {
      if (getDartReadScope(useAppStore.getState().settings!, null).contextKey !== contextKey) {
        setCreateSubmitting(false)
        createInFlightRef.current = false
        return
      }
      noteDartTaskCreated(task)
      setDartRefreshNonce((nonce) => nonce + 1)
      openDartDetailPage(task)
      setCreateNotice(null)
      unknownRef.current = false
      setUnknown(false)
      setListChecked(false)
      setCreateMatches([])
      setCreateMatchesTruncated(false)
      setMatchesDismissed(false)
      setCreateDraftState(EMPTY_DART_CREATE_DRAFT)
      setCreateOpen(false)
      setCreateSubmitting(false)
      createInFlightRef.current = false
      toast.success(translate('auto.components.task.page.dart.TaskCreateDialog.created', 'Created'))
    },
    [noteDartTaskCreated, openDartDetailPage, setDartRefreshNonce]
  )

  const refuseCreate = useCallback((message: string, field?: string): void => {
    setCreateNotice({ kind: 'refused', ...(field ? { field } : {}), message })
    setCreateSubmitting(false)
    createInFlightRef.current = false
  }, [])

  /** The write may have landed, so the task is looked up before another create is offered. */
  const reportUnknownOutcome = useCallback(async (): Promise<void> => {
    unknownRef.current = true
    setUnknown(true)
    setListChecked(false)
    setMatchesDismissed(false)
    setCreateNotice({
      kind: 'unknown',
      message: translate(
        MAY_HAVE_CREATED_MESSAGE,
        'Dart may have created this task. Check these before creating it again.'
      )
    })
    setCreateSubmitting(false)
    createInFlightRef.current = false
    await checkAgain()
  }, [checkAgain])

  const createTask = useCallback<DartCreateTaskModel['createTask']>(
    async (input) => {
      if (unknownRef.current) {
        return {
          ok: false,
          outcome: 'notApplied',
          error: 'Review the possible previous creation first.'
        }
      }
      if (createInFlightRef.current) {
        return { ok: false, outcome: 'notApplied', error: 'A Dart create is already running.' }
      }
      const title = typeof input.title === 'string' ? input.title.trim() : ''
      const dartboard = typeof input.dartboard === 'string' ? input.dartboard : ''
      const refusal = dartCreateRefusal(
        title,
        typeof input.description === 'string' ? input.description : undefined,
        dartboard,
        dartConfig
      )
      if (refusal) {
        refuseCreate(refusal)
        return { ok: false, outcome: 'notApplied', error: refusal }
      }
      setCreateSubmitting(true)
      const contextKey = getDartReadScope(useAppStore.getState().settings!, null).contextKey
      createInFlightRef.current = true
      const args: DartCreateTaskArgs = { ...input, title, dartboard }
      // An empty type list means Dart applies its own default, so no type is sent.
      if (!dartConfig?.types.length) {
        delete args.type
      }
      return submitDartCreate(args, {
        create: (createArgs) => useAppStore.getState().createDartTask(createArgs),
        contextKey,
        finishCreate,
        refuseCreate,
        reportUnknownOutcome
      })
    },
    [dartConfig, finishCreate, refuseCreate, reportUnknownOutcome]
  )

  /** The retry the user asks for explicitly, once the lookup found nothing of theirs. */
  const createAnyway = useCallback<DartCreateTaskModel['createAnyway']>(async () => {
    if (!canCreateAnyway) {
      return { ok: false, outcome: 'notApplied', error: 'Create anyway needs a checked list.' }
    }
    if (createInFlightRef.current) {
      return { ok: false, outcome: 'notApplied', error: 'A Dart create is already running.' }
    }
    const refusal = dartCreateRefusal(
      createDraft.title.trim(),
      createDraft.description,
      createDraft.dartboard,
      dartConfig
    )
    if (refusal) {
      refuseCreate(refusal)
      return { ok: false, outcome: 'notApplied', error: refusal }
    }
    const contextKey = getDartReadScope(useAppStore.getState().settings!, null).contextKey
    createInFlightRef.current = true
    setCreateSubmitting(true)
    const args = dartCreateArgs(createDraft, createSupportsWritesV2)
    if (!dartConfig?.types.length) {
      delete args.type
    }
    return submitDartCreate(args, {
      create: (createArgs) => useAppStore.getState().createDartTask(createArgs),
      contextKey,
      finishCreate,
      refuseCreate,
      reportUnknownOutcome
    })
  }, [
    canCreateAnyway,
    createDraft,
    createSupportsWritesV2,
    dartConfig,
    finishCreate,
    refuseCreate,
    reportUnknownOutcome
  ])
  return Object.assign(model, {
    createOpen,
    createSupportsWritesV2,
    createSubmitting,
    openCreate,
    closeCreate,
    createTask,
    createDraft,
    setCreateDraft,
    createUnresolved: unknown,
    createLookingUp: lookingUp,
    createNotice,
    listChecked,
    createMatches,
    createMatchesTruncated,
    canCreateAnyway,
    dismissCreateNotice,
    checkAgain,
    dismissMatches,
    createAnyway
  })
}
