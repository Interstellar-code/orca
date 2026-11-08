import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DartLayout } from '../../../../../shared/dart/dart-saved-views'
import type { DartConnectionStatus, DartTask } from '../../../../../shared/dart/dart-types'
import type { TaskProvider } from '../../../../../shared/task-providers'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import type { Worktree } from '../../../../../shared/worktree/types'
import {
  buildDartTaskWorkspaceAttachmentIndex,
  collectLinkedDartTaskRefs,
  findDartTaskWorkspaceAttachmentsInIndex
} from '@/lib/dart-issue-workspace-attachment'
import { useAppStore } from '@/store'
import { dartPageScopeFromContextKey } from '@/store/slices/dart/dart-read-coordination'
import { dartScopeCacheKey } from '@/store/slices/dart/dart-scope-read-actions'
import { dartAccountIdentity, dartScopeViewerId } from '@/store/slices/dart/dart-task-identity'
import type { DartBoardFeatures, DartScopeMeta } from './dart-board-contracts'
import { splitDartBoardFilters } from './task-page-dart-list-model'
import { useDartAccountFilters } from './use-dart-account-filters'
import { useDartBoardModel } from './use-dart-board-model'
import { useDartHostFeatures } from './use-dart-host-features'
import { useDartFilterActions } from './use-dart-filter-actions'
import { useDartDisplayedTasks } from './use-dart-displayed-tasks'
import { useDartListPinnedRows } from './use-dart-list-pinned-rows'
import {
  useDartListRead,
  type DartListReadActions,
  type TaskPageDartError
} from './use-dart-list-read'
import { useDartViewMode } from './use-dart-view-mode'
import { useDartVisibilityRefresh } from './use-dart-visibility-refresh'
import { useDartWorkspaceConfig } from './use-dart-workspace-config'
import { useDartSavedViewState } from './use-dart-saved-view-state'

export type { TaskPageDartError }

export type TaskPageDartStateInput = Pick<
  DartListReadActions,
  'listDartTasks' | 'fetchDartTask' | 'fetchDartConfig' | 'openDartDetailPage'
> & {
  providerRuntimeContextKey: string
  taskSource: TaskProvider
  dartConnected: boolean
  dartStatus: DartConnectionStatus
  dartTaskSourceContext: TaskSourceContext | null
  linearAttachmentWorkspaces: readonly Worktree[]
}

export type DartLayoutSwitchDisabledReason = 'linked' | 'oldHost'

const EMPTY_TASKS: readonly DartTask[] = []

export function useTaskPageDartState<TModel extends TaskPageDartStateInput>(model: TModel) {
  const {
    providerRuntimeContextKey,
    taskSource,
    dartConnected,
    dartStatus,
    dartTaskSourceContext,
    linearAttachmentWorkspaces,
    listDartTasks,
    fetchDartTask,
    fetchDartConfig
  } = model
  const readDartScope = useAppStore((s) => s.readDartScope)
  const publishDartScope = useAppStore((s) => s.publishDartScope)
  const mountDartScope = useAppStore((s) => s.mountDartScope)
  const [dartHasWorkspace, setDartHasWorkspace] = useState(false)
  const [dartRefreshNonce, setDartRefreshNonce] = useState(0)
  const [dartTasks, setDartTasks] = useState<DartTask[]>([])
  const [dartTotalCount, setDartTotalCount] = useState(0)
  const { viewMode, setViewMode, setDartLayout, setDartShowEmptyColumns } = useDartViewMode()
  const active = taskSource === 'dart' && dartConnected
  const viewerId = dartStatus.viewer?.id ?? null
  const pageScope = useMemo(
    () => dartPageScopeFromContextKey(providerRuntimeContextKey),
    [providerRuntimeContextKey]
  )
  const accountViewerId = useAppStore((s) => dartScopeViewerId(s, pageScope))
  const { hostKey, accountKey } = dartAccountIdentity(pageScope, accountViewerId)
  const [dartFilters, setDartFilters] = useDartAccountFilters(hostKey, accountKey)
  const { dartSearchInput, setDartSearchInput, setDartFilter, applyDartSearch } =
    useDartFilterActions(setDartFilters)
  // Latest callbacks stay out of effect deps so identity churn never refetches.
  const actions: DartListReadActions = {
    listDartTasks,
    fetchDartTask,
    fetchDartConfig,
    readDartScope,
    publishDartScope,
    mountDartScope,
    openDartDetailPage: model.openDartDetailPage
  }
  const actionsRef = useRef(actions)
  useEffect(() => {
    actionsRef.current = actions
  })
  const { dartConfig, dartConfigError } = useDartWorkspaceConfig({
    active,
    refreshNonce: dartRefreshNonce,
    hostKey,
    accountViewerId,
    fetchDartConfig
  })
  const { featuresReady, hostFeatures } = useDartHostFeatures({
    active,
    hostKey,
    target: pageScope.target
  })
  const hostSupportsBoard = hostFeatures?.board === true
  const boardPath = hostSupportsBoard && !dartHasWorkspace
  const layout: DartLayout = boardPath ? viewMode.layout : 'list'
  const layoutSwitchDisabledReason: DartLayoutSwitchDisabledReason | null = dartHasWorkspace
    ? 'linked'
    : featuresReady && !hostSupportsBoard
      ? 'oldHost'
      : null
  const { server, client } = splitDartBoardFilters(dartFilters)
  const serverFiltersKey = JSON.stringify(server)
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- Why: serverFiltersKey fingerprints the three server filters.
  const serverFilters = useMemo(() => server, [serverFiltersKey])
  const { status, tag, priority, onHold } = client
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- Why: the four client filters are listed individually.
  const clientFilters = useMemo(() => client, [status, tag, priority, onHold])
  const scopeKey = useMemo(
    () => (boardPath ? dartScopeCacheKey(pageScope, serverFilters) : null),
    [boardPath, serverFilters, pageScope]
  )
  const scopeEntry = useAppStore((s) => (scopeKey ? s.dartListCache[scopeKey] : undefined))
  const scopeMeta: DartScopeMeta | null = useAppStore((s) =>
    scopeKey ? (s.dartScopeMetaCache[scopeKey] ?? null) : null
  )
  const baseTasks: readonly DartTask[] = boardPath
    ? (scopeEntry?.data?.tasks ?? EMPTY_TASKS)
    : dartTasks

  const patchLocalRow = useCallback((taskId: string, fields: Partial<DartTask>) => {
    setDartTasks((rows) =>
      rows.map((candidate) => (candidate.id === taskId ? { ...candidate, ...fields } : candidate))
    )
  }, [])
  const { pinnedRows, clearPinsOnNewList, noteDartTaskCreated } = useDartListPinnedRows({
    active,
    hostKey,
    accountKey,
    tasks: baseTasks,
    onRowPatch: boardPath ? undefined : patchLocalRow
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

  const searchKey = dartFilters.search
  // Status is a server filter only on the list-only read path (D2.7, D11).
  const listKey = JSON.stringify(
    boardPath
      ? [serverFiltersKey, viewerId]
      : [dartFilters.mine, dartFilters.status, dartFilters.dartboard, searchKey, viewerId]
  )
  const { dartLoading, dartError } = useDartListRead({
    active,
    featuresReady,
    boardPath,
    pageScope,
    hostFeatures,
    listKey,
    filters: dartFilters,
    serverFilters,
    hasWorkspace: dartHasWorkspace,
    linkedRefs,
    linkedRefsSignature,
    sourceContext: dartTaskSourceContext,
    refreshNonce: dartRefreshNonce,
    hostKey,
    accountKey,
    viewerId,
    actionsRef,
    clearPinsOnNewList,
    setDartTasks,
    setDartTotalCount
  })
  useDartVisibilityRefresh({
    enabled: active && boardPath,
    fetchedAt: scopeMeta?.fetchedAt ?? 0,
    loading: dartLoading,
    onStale: () => setDartRefreshNonce((n) => n + 1)
  })

  const {
    tasks: displayedDartTasks,
    totalCount: displayedTotalCount,
    loadedCount: dartLoadedCount
  } = useDartDisplayedTasks({
    boardPath,
    hasWorkspace: dartHasWorkspace,
    layout,
    baseTasks,
    localTotal: dartTotalCount,
    scopeMeta,
    pinnedRows,
    hostKey,
    accountKey,
    search: searchKey,
    clientFilters
  })

  const dartSavedViews = useDartSavedViewState({
    active,
    target: pageScope.target,
    filters: dartFilters,
    viewMode,
    setViewMode,
    setFilters: setDartFilters,
    setSearchInput: setDartSearchInput,
    setHasWorkspace: setDartHasWorkspace
  })
  const boardFeatures: DartBoardFeatures = useMemo(
    () => ({ board: hostSupportsBoard, savedViews: dartSavedViews.supported }),
    [hostSupportsBoard, dartSavedViews.supported]
  )
  const openDartTask = useCallback((task: DartTask) => {
    actionsRef.current.openDartDetailPage?.(task)
  }, [])
  const dartBoardModel = useDartBoardModel({
    scopeKey,
    pageScope,
    layout,
    serverFilters,
    clientFilters,
    showEmptyColumns: viewMode.showEmptyColumns,
    config: dartConfig,
    features: boardFeatures,
    hostKey,
    accountKey,
    pinnedRows,
    onOpenTask: openDartTask
  })

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
    dartLayout: DartLayout
    setDartLayout: typeof setDartLayout
    dartShowEmptyColumns: boolean
    setDartShowEmptyColumns: typeof setDartShowEmptyColumns
    dartLayoutSwitchDisabledReason: DartLayoutSwitchDisabledReason | null
    dartBoardPath: boolean
    dartScopeMeta: DartScopeMeta | null
    dartLoadedCount: number
    dartBoardModel: typeof dartBoardModel
    dartSavedViews: typeof dartSavedViews
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
  nextModel.dartTotalCount = displayedTotalCount
  nextModel.dartLoading = dartLoading || (active && !featuresReady)
  nextModel.dartError = dartError
  nextModel.dartConfig = dartConfig
  nextModel.dartConfigError = dartConfigError
  nextModel.getDartTaskWorkspaces = getDartTaskWorkspaces
  nextModel.noteDartTaskCreated = noteDartTaskCreated
  nextModel.dartLayout = layout
  nextModel.setDartLayout = setDartLayout
  nextModel.dartShowEmptyColumns = viewMode.showEmptyColumns
  nextModel.setDartShowEmptyColumns = setDartShowEmptyColumns
  nextModel.dartLayoutSwitchDisabledReason = layoutSwitchDisabledReason
  nextModel.dartBoardPath = boardPath
  nextModel.dartScopeMeta = scopeMeta
  nextModel.dartLoadedCount = dartLoadedCount
  nextModel.dartBoardModel = dartBoardModel
  nextModel.dartSavedViews = dartSavedViews
  return nextModel
}
export type TaskPageDartStateFields = Omit<
  ReturnType<typeof useTaskPageDartState<TaskPageDartStateInput>>,
  keyof TaskPageDartStateInput
>
