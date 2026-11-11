import type {
  DartHostFeatures,
  DartTask,
  DartTaskRelationships,
  DartWorkspaceConfig
} from '../../../../../shared/dart/dart-types'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import type { DartBoardFilters, DartSavedView } from '../../../../../shared/dart/dart-saved-views'
import type { DartClientResult } from '@/runtime/runtime-dart-client'
import type { DartWriteResult } from '@/runtime/runtime-dart-write-client'
import type { DartNoticeApi } from './dart-detail-contracts'

export type DartServerFilters = Readonly<Pick<DartBoardFilters, 'mine' | 'dartboard' | 'search'>>

export type DartClientFilters = Readonly<Omit<DartBoardFilters, 'mine' | 'dartboard' | 'search'>>

export type DartBoardFeatures = DartHostFeatures & { readonly savedViews: boolean }

export type DartScopeMeta = {
  readonly openTotal: number
  readonly doneTotal: number
  readonly doneOffset: number
  readonly generation: number
  readonly fetchedAt: number
  readonly incomplete: boolean
  readonly partialReason: 'rateLimited' | 'error' | 'changed' | null
  /** Session-unique, increasing id of the read set last published into this scope; absent = never published. */
  readonly publicationId?: number
  /** The publication whose first on-hold reads started; lives and is evicted with the meta. */
  readonly onHoldReadPublicationId?: number
}

export type DartScopeReadResult = {
  /** Deduped, read order. */
  readonly tasks: readonly DartTask[]
  readonly openTotal: number
  readonly doneTotal: number
  readonly doneOffset: number
  readonly incomplete: boolean
  readonly failure: { readonly reason: 'rateLimited' | 'error'; readonly message: string } | null
}

export type DartLoad<T> = {
  readonly state: 'idle' | 'loading' | 'ready' | 'error'
  readonly data: T | null
  readonly error: string | null
  retry(): void
}

export type DartBoardColumn = {
  readonly key: string
  readonly status: string
  readonly inConfig: boolean
  readonly tasks: readonly DartTask[]
  readonly count: number
}

export type DartRelationshipState = 'known' | 'loading' | 'error' | 'notChecked'

/** Optional fields are unset on a host without relationships: a release A card with no marker or count. */
export type DartCardInfo = {
  readonly task: DartTask
  readonly onHold: boolean
  readonly relationshipState?: DartRelationshipState
  readonly blockedBy?: number | null
  readonly blocking?: number | null
  readonly subtasks?: { readonly loaded: number; readonly total: number | null } | null
}

export type DartRelationshipCacheEntry = {
  readonly state: DartRelationshipState
  readonly relationships: DartTaskRelationships | null
  readonly fetchedAt: number
  readonly error: string | null
  /** Publication this on-hold read was made for; absent or another id counts as not checked (D14.3). */
  readonly publicationId?: number
}

export type DartNestedListRow = {
  readonly task: DartTask
  readonly depth: 0 | 1
  readonly parentId: string | null
}

export type DartTaskPage = {
  readonly tasks: readonly DartTask[]
  readonly total: number
  readonly complete: boolean
}

export type DartNestedListModel = {
  readonly rows: readonly DartNestedListRow[]
  /** False while the list is flat (D13.2). */
  readonly nested: boolean
  readonly hiddenSubtasks: number
  readonly expanded: ReadonlySet<string>
  toggle(taskId: string): void
  canExpand(task: DartTask): boolean
  children(taskId: string): DartLoad<DartTaskPage>
  cardInfo(taskId: string): DartCardInfo
}

export type DartOpenTask = (task: DartTask, sourceContext?: TaskSourceContext | null) => void

export type DartRelationshipsApi = {
  readonly task: DartTask
  readonly state: DartRelationshipState
  /** Null when the task has no parentId. */
  readonly parent: DartLoad<DartTask> | null
  readonly blockers: DartLoad<readonly DartTask[]>
  readonly blocking: DartLoad<readonly DartTask[]>
  readonly subtasks: DartLoad<DartTaskPage>
  readonly pending: boolean
  /** Field `relationships` in the write queue's pendingFields / blockedFields. */
  readonly blocked: boolean
  readonly notice: DartNoticeApi
  onSetBlockers(ids: readonly string[]): Promise<DartWriteResult<{ task: DartTask }>>
  searchTasks(
    text: string,
    options?: { thisDartboardOnly?: boolean }
  ): Promise<DartClientResult<{ tasks: readonly DartTask[] }>>
}

/** No viewer id (D2.10); undefined without a task or `dart.relationships.v1`, so the sections hide. */
export type UseDartTaskRelationships = (args: {
  task: DartTask | null
  sourceContext: TaskSourceContext | null
  config: DartWorkspaceConfig | null
}) => DartRelationshipsApi | undefined

// Selector signatures for B3 to implement; `relationships` maps are keyed by task id.
export type BuildDartTaskTree = (
  tasks: readonly DartTask[],
  children: ReadonlyMap<string, readonly DartTask[]>,
  opts: { nested: boolean }
) => { rows: readonly DartNestedListRow[]; hiddenSubtasks: number }

export type BuildDartCardInfo = (
  task: DartTask,
  relationships?: DartRelationshipCacheEntry,
  loadedChildren?: readonly DartTask[]
) => DartCardInfo

export type ApplyDartBoardFilters = (
  tasks: readonly DartTask[],
  filters: DartClientFilters,
  relationships?: ReadonlyMap<string, DartRelationshipCacheEntry>
) => DartTask[]

// buildDartBoardColumns opts gain `nested?: boolean` (absent = false; true leaves out every task
// with a parentId), and TaskPageDartTaskList props gain `nested?: DartNestedListModel`
// (absent = flat); B3 and B4 add those at their call sites.

export type DartBoardModel = {
  readonly columns: readonly DartBoardColumn[]
  /** Every /config status, for "Move to". */
  readonly statuses: readonly string[]
  readonly hostKey: string
  /** Drag payload and per-card write state. */
  readonly accountKey: string
  readonly showEmptyColumns: boolean
  readonly meta: DartScopeMeta
  readonly hasMoreDone: boolean
  readonly doneMore: DartLoad<null>
  readonly features: DartBoardFeatures
  /** On-hold tasks not yet read for blockers; absent = 0. */
  readonly notChecked?: number
  /** Reads the next batch of not-checked tasks; absent = no "Check" button. */
  checkMore?(): void
  cardInfo(taskId: string): DartCardInfo
  onMove(task: DartTask, status: string): Promise<DartWriteResult<{ task: DartTask }>>
  showMoreDone(): void
  onOpenTask(task: DartTask): void
}

export type DartBoardProps = {
  readonly model: DartBoardModel
  readonly selectedTaskId: string | null
}

export type DartSavedViewsModel = {
  readonly views: readonly DartSavedView[]
  readonly activeViewId: string | null
  readonly modified: boolean
  readonly load: DartLoad<null>
  readonly pending: boolean
  readonly supported: boolean
  apply(id: string | null): Promise<boolean>
  /** Overwrites the active view, keeps its name. */
  saveCurrent(): Promise<boolean>
  saveAsNew(name: string): Promise<boolean>
  rename(id: string, name: string): Promise<boolean>
  remove(id: string): Promise<boolean>
}
