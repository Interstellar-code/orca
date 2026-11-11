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
import { useDartSubtaskNesting } from './use-dart-subtask-nesting'
import { useDartOnHoldRelationshipReads } from './use-dart-on-hold-relationship-reads'
import { useDartHostFeatures } from './use-dart-host-features'
import { useDartFilterActions } from './use-dart-filter-actions'
import { useDartEffectiveClientFilters } from './use-dart-effective-client-filters'
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
  const { viewMode, setViewMode, setDartLayout, setDartShowEmptyColumns, setDartNestSubtasks } =
    useDartViewMode()
  const active = taskSource === 'dart' && dartConnected
  const pageScope = useMemo(
    () => dartPageScopeFromContextKey(providerRuntimeContextKey),
    [providerRuntimeContextKey]
  )
  // Scoped: a status that still describes another host gives this page no viewer.
  const viewerId = useAppStore((s) => dartScopeViewerId(s, pageScope))
  const { hostKey, accountKey } = dartAccountIdentity(pageScope, viewerId)
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
    accountViewerId: viewerId,
    fetchDartConfig
  })
  const { featuresReady, hostFeatures } = useDartHostFeatures({
    active,
    hostKey,
    target: pageScope.target
  })
  const hostSupportsBoard = hostFeatures?.board === true
  const relationshipsHost = hostFeatures?.relationships === true
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
  const clientFilters = useDartEffectiveClientFilters(client, relationshipsHost)
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
  useDartOnHoldRelationshipReads({
    active: active && relationshipsHost,
    scopeKey,
    scopeEntryTasks: scopeEntry?.data?.tasks,
    scopeMeta,
    pageScope,
    viewerId
  })

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
    relationshipsHost,
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
    () => ({
      board: hostSupportsBoard,
      savedViews: dartSavedViews.supported,
      ...(relationshipsHost ? { relationships: true } : {})
    }),
    [hostSupportsBoard, dartSavedViews.supported, relationshipsHost]
  )
  const { nested: nestedList, model: dartNestedList } = useDartSubtaskNesting({
    boardPath,
    relationshipsHost,
    nestSubtasks: viewMode.nestSubtasks,
    search: dartFilters.search,
    clientFilters,
    tasks: displayedDartTasks,
    pageScope,
    hostKey,
    accountKey,
    publicationId: scopeMeta?.publicationId
  })
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
    nested: nestedList,
    config: dartConfig,
    features: boardFeatures,
    hostKey,
    accountKey,
    pinnedRows,
    onOpenTask: openDartTask
  })
  const optionalConfigError: { dartConfigError?: typeof dartConfigError } = { dartConfigError }
  // Why: the page model is one shared object that later hooks read, so the Dart fields are added in place.
  return Object.assign(model, {
    dartFilters,
    setDartFilter,
    dartSearchInput,
    setDartSearchInput,
    applyDartSearch,
    dartHasWorkspace,
    setDartHasWorkspace,
    setDartRefreshNonce,
    dartTasks: displayedDartTasks,
    dartTotalCount: displayedTotalCount,
    dartLoading: dartLoading || (active && !featuresReady),
    dartError,
    dartConfig,
    ...optionalConfigError,
    getDartTaskWorkspaces,
    noteDartTaskCreated,
    dartLayout: layout,
    setDartLayout,
    dartShowEmptyColumns: viewMode.showEmptyColumns,
    setDartShowEmptyColumns,
    dartLayoutSwitchDisabledReason: layoutSwitchDisabledReason,
    dartBoardPath: boardPath,
    dartScopeMeta: scopeMeta,
    dartLoadedCount,
    dartBoardModel,
    dartSavedViews,
    dartNestedList,
    dartNestSubtasks: viewMode.nestSubtasks,
    setDartNestSubtasks,
    dartRelationshipsHost: relationshipsHost
  })
}
export type TaskPageDartStateFields = Omit<
  ReturnType<typeof useTaskPageDartState<TaskPageDartStateInput>>,
  keyof TaskPageDartStateInput
>
