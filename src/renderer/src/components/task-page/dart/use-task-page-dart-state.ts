import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  DartConnectionStatus,
  DartTask,
  DartTaskPage,
  DartWorkspaceConfig
} from '../../../../../shared/dart/dart-types'
import type { DartListTasksArgs } from '../../../../../shared/rpc-contract/dart-params'
import type { TaskProvider } from '../../../../../shared/task-providers'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import type { Worktree } from '../../../../../shared/worktree/types'
import { translate } from '@/i18n/i18n'
import {
  buildDartTaskWorkspaceAttachmentIndex,
  collectLinkedDartTaskRefs,
  findDartTaskWorkspaceAttachmentsInIndex
} from '@/lib/dart-issue-workspace-attachment'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { taskProviderErrorMessage } from '@/lib/task-provider-error-copy'
import type { DartClientResult } from '@/runtime/runtime-dart-client'
import { useAppStore } from '@/store'
import { getDartReadScope } from '@/store/slices/dart/dart-read-coordination'
import {
  captureDartEpoch,
  dartAccountIdentity,
  dartScopeViewerId
} from '@/store/slices/dart/dart-task-identity'
import { readPastDartWrites } from './dart-stale-read'
import {
  buildDartListArgs,
  DEFAULT_DART_LIST_FILTERS,
  sortDartTasksByRecency,
  type DartListFilters
} from './task-page-dart-list-model'
import { filterLinkedDartTasks, readLinkedDartTasks } from './task-page-dart-linked-issues'
import { useDartListPinnedRows } from './use-dart-list-pinned-rows'

export type TaskPageDartError = { message: string; code?: string }

type DartListOutcome = {
  tasks: DartTask[]
  totalCount: number
  error: TaskPageDartError | null
}

export type TaskPageDartStateInput = {
  taskSource: TaskProvider
  dartConnected: boolean
  dartStatus: DartConnectionStatus
  dartTaskSourceContext: TaskSourceContext | null
  linearAttachmentWorkspaces: readonly Worktree[]
  listDartTasks: (
    args?: DartListTasksArgs,
    options?: { force?: boolean }
  ) => Promise<DartClientResult<DartTaskPage>>
  fetchDartTask: (
    taskId: string,
    options?: { sourceContext?: TaskSourceContext | null; force?: boolean }
  ) => Promise<DartClientResult<{ task: DartTask }>>
  fetchDartConfig: (options?: {
    force?: boolean
  }) => Promise<DartClientResult<{ config: DartWorkspaceConfig }>>
}

export function useTaskPageDartState<TModel extends TaskPageDartStateInput>(model: TModel) {
  const {
    taskSource,
    dartConnected,
    dartStatus,
    dartTaskSourceContext,
    linearAttachmentWorkspaces,
    listDartTasks,
    fetchDartTask,
    fetchDartConfig
  } = model
  const [dartFilters, setDartFilters] = useState<DartListFilters>(DEFAULT_DART_LIST_FILTERS)
  const [dartSearchInput, setDartSearchInput] = useState('')
  const [dartHasWorkspace, setDartHasWorkspace] = useState(false)
  const [dartRefreshNonce, setDartRefreshNonce] = useState(0)
  const [dartTasks, setDartTasks] = useState<DartTask[]>([])
  const [dartTotalCount, setDartTotalCount] = useState(0)
  const [dartLoading, setDartLoading] = useState(false)
  const [dartError, setDartError] = useState<TaskPageDartError | null>(null)
  const [dartConfig, setDartConfig] = useState<DartWorkspaceConfig | null>(null)
  const [dartConfigError, setDartConfigError] = useState<string | null>(null)
  const active = taskSource === 'dart' && dartConnected
  const viewerId = dartStatus.viewer?.id ?? null
  const activeRuntimeEnvironmentId = useAppStore((s) => s.settings?.activeRuntimeEnvironmentId)
  const pageContextKey = useAppStore((s) => getProviderRuntimeContextKey(s.settings))
  // The context key is a dep because its session generation decides whose status the scope trusts.
  const pageScope = useMemo(
    () => getDartReadScope({ activeRuntimeEnvironmentId }),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- Why: see above.
    [activeRuntimeEnvironmentId, pageContextKey]
  )
  const accountViewerId = useAppStore((s) => dartScopeViewerId(s, pageScope))
  const { hostKey, accountKey } = dartAccountIdentity(pageScope, accountViewerId)
  const shownRowsKeyRef = useRef<string | null>(null)
  const { clearPinsOnNewList, mergeListRead, noteDartTaskCreated } = useDartListPinnedRows({
    active,
    hostKey,
    accountKey,
    dartTasks,
    setDartTasks,
    setDartTotalCount
  })
  // Latest callbacks stay out of effect deps so identity churn never refetches.
  const actionsRef = useRef({ listDartTasks, fetchDartTask, fetchDartConfig })
  useEffect(() => {
    actionsRef.current = { listDartTasks, fetchDartTask, fetchDartConfig }
  })

  const attachmentIndex = useMemo(
    () => buildDartTaskWorkspaceAttachmentIndex(linearAttachmentWorkspaces),
    [linearAttachmentWorkspaces]
  )
  const getDartTaskWorkspaces = useCallback(
    (task: Pick<DartTask, 'id'>) =>
      findDartTaskWorkspaceAttachmentsInIndex(attachmentIndex, task, dartTaskSourceContext),
    [attachmentIndex, dartTaskSourceContext]
  )
  const linkedRefs = useMemo(
    () => collectLinkedDartTaskRefs(linearAttachmentWorkspaces, dartTaskSourceContext),
    [linearAttachmentWorkspaces, dartTaskSourceContext]
  )
  const linkedRefsSignature = JSON.stringify(linkedRefs)

  useEffect(() => {
    if (!active) {
      return
    }
    let cancelled = false
    setDartConfigError(null)
    void actionsRef.current
      .fetchDartConfig({ force: dartRefreshNonce > 0 })
      .then((result) => {
        if (cancelled) {
          return
        }
        if (result.ok) {
          setDartConfig(result.config)
        } else {
          setDartConfigError(taskProviderErrorMessage(result))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDartConfigError(
            translate(
              'auto.components.task.page.dart.TaskCreateDialog.configFailed',
              'Could not load Dart configuration.'
            )
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [active, dartRefreshNonce])

  const searchKey = dartFilters.search
  const listKey = JSON.stringify([
    dartFilters.mine,
    dartFilters.status,
    dartFilters.dartboard,
    searchKey,
    viewerId
  ])
  useEffect(() => {
    if (!active) {
      return
    }
    let cancelled = false
    clearPinsOnNewList(JSON.stringify([hostKey, listKey, dartHasWorkspace, dartRefreshNonce]))
    const rowsKey = JSON.stringify([hostKey, listKey, dartHasWorkspace, linkedRefsSignature])
    setDartLoading(true)
    setDartError(null)
    const listArgs = dartHasWorkspace ? null : buildDartListArgs(dartFilters, viewerId)
    const readList = (force: boolean): Promise<DartListOutcome> => {
      const request: Promise<DartListOutcome> = dartHasWorkspace
        ? readLinkedDartTasks(
            linkedRefs,
            (taskId, options) => actionsRef.current.fetchDartTask(taskId, options),
            dartTaskSourceContext,
            force
          ).then((linked) => ({
            tasks: linked.tasks,
            totalCount: linked.tasks.length,
            error: linked.error
          }))
        : listArgs === null
          ? Promise.resolve({ tasks: [], totalCount: 0, error: null })
          : actionsRef.current.listDartTasks(listArgs, { force }).then((result) =>
              result.ok
                ? {
                    tasks: result.tasks,
                    totalCount: result.totalCount,
                    error: null
                  }
                : {
                    tasks: [],
                    totalCount: 0,
                    error: {
                      message: taskProviderErrorMessage(result),
                      code: result.errorCode
                    }
                  }
            )
      return request.catch((): DartListOutcome => ({
        tasks: [],
        totalCount: 0,
        error: { message: '' }
      }))
    }
    void readPastDartWrites({
      captureEpoch: () => captureDartEpoch({ hostKey }),
      cancelled: () => cancelled,
      force: dartRefreshNonce > 0,
      read: readList
    }).then(({ result, current }) => {
      if (cancelled) {
        return
      }
      setDartLoading(false)
      // Past the re-read limit the rows on screen stay, unless they answer another filter.
      if (!current && shownRowsKeyRef.current === rowsKey) {
        return
      }
      shownRowsKeyRef.current = rowsKey
      const outcome = mergeListRead(result)
      setDartTasks(outcome.tasks)
      setDartTotalCount(outcome.totalCount)
      setDartError(outcome.error)
    })
    return () => {
      cancelled = true
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- Why: listKey/linkedRefsSignature fingerprint the filters and refs read here.
  }, [
    active,
    listKey,
    dartHasWorkspace,
    linkedRefsSignature,
    dartRefreshNonce,
    hostKey,
    accountKey
  ])

  const displayedDartTasks = useMemo(
    () =>
      sortDartTasksByRecency(
        dartHasWorkspace ? filterLinkedDartTasks(dartTasks, searchKey) : dartTasks
      ),
    [dartTasks, dartHasWorkspace, searchKey]
  )

  const setDartFilter = useCallback(
    <K extends keyof DartListFilters>(key: K, value: DartListFilters[K]) =>
      setDartFilters((current) => ({ ...current, [key]: value })),
    []
  )
  const applyDartSearch = useCallback(
    (value: string) => {
      const trimmed = value.trim()
      setDartSearchInput(trimmed)
      setDartFilter('search', trimmed)
    },
    [setDartFilter]
  )

  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the fields added below are assigned right after this cast, before the model is returned.
  const nextModel = model as TModel & {
    dartFilters: typeof dartFilters
    setDartFilter: typeof setDartFilter
    dartSearchInput: typeof dartSearchInput
    setDartSearchInput: typeof setDartSearchInput
    applyDartSearch: typeof applyDartSearch
    dartHasWorkspace: typeof dartHasWorkspace
    setDartHasWorkspace: typeof setDartHasWorkspace
    setDartRefreshNonce: typeof setDartRefreshNonce
    dartTasks: typeof displayedDartTasks
    dartTotalCount: typeof dartTotalCount
    dartLoading: typeof dartLoading
    dartError: typeof dartError
    dartConfig: typeof dartConfig
    dartConfigError?: typeof dartConfigError
    getDartTaskWorkspaces: typeof getDartTaskWorkspaces
    noteDartTaskCreated: typeof noteDartTaskCreated
  }
  nextModel.dartFilters = dartFilters
  nextModel.setDartFilter = setDartFilter
  nextModel.dartSearchInput = dartSearchInput
  nextModel.setDartSearchInput = setDartSearchInput
  nextModel.applyDartSearch = applyDartSearch
  nextModel.dartHasWorkspace = dartHasWorkspace
  nextModel.setDartHasWorkspace = setDartHasWorkspace
  nextModel.setDartRefreshNonce = setDartRefreshNonce
  nextModel.dartTasks = displayedDartTasks
  nextModel.dartTotalCount = dartTotalCount
  nextModel.dartLoading = dartLoading
  nextModel.dartError = dartError
  nextModel.dartConfig = dartConfig
  nextModel.dartConfigError = dartConfigError
  nextModel.getDartTaskWorkspaces = getDartTaskWorkspaces
  nextModel.noteDartTaskCreated = noteDartTaskCreated
  return nextModel
}
export type TaskPageDartStateFields = Omit<
  ReturnType<typeof useTaskPageDartState<TaskPageDartStateInput>>,
  keyof TaskPageDartStateInput
>
