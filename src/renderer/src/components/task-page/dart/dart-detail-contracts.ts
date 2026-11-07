import type {
  DartComment,
  DartTask,
  DartWorkspaceConfig
} from '../../../../../shared/dart/dart-types'
import type {
  DartCreateTaskArgs,
  DartUpdateTaskDescriptionArgs
} from '../../../../../shared/rpc-contract/dart-params'
import type { DartClientResult } from '@/runtime/runtime-dart-client'
import type { DartFieldUpdates, DartWriteResult } from '@/runtime/runtime-dart-write-client'
import type { DartCommentsView, DartDetailLoadState } from './TaskDetailView'

export type DartWriteNotice = {
  kind: 'unknown' | 'refused'
  field?: string
  message: string
  checkedAt?: number
}

export type DartNoticeApi = {
  notice: DartWriteNotice | null
  dismissNotice(): void
  recheckNotice(): Promise<void>
}

export type DartDetailEditApi = {
  task: DartTask
  openUrl: string | null
  onUpdate(
    updates: DartFieldUpdates,
    optimistic: Partial<DartTask>
  ): Promise<DartWriteResult<{ task: DartTask }>>
  /** Writes queued or in flight. */
  pendingFields: ReadonlySet<string>
  /** Unreconciled unknown writes: no write is sent to these until the user dismisses the notice. */
  blockedFields: ReadonlySet<string>
  config: DartWorkspaceConfig | null
  /** The config read finished without a config; false while it is still loading. */
  configFailed?: boolean
  supportsWritesV2: boolean
  viewerName: string | null
}

export type DartDetailCommentsApi = {
  comments: DartDetailLoadState<DartCommentsView>
  onAddComment(input: {
    text: string
    parentId?: string
  }): Promise<DartWriteResult<{ comment: DartComment }>>
  reloadComments(): Promise<void>
  appendLocalComment(comment: DartComment): void
  draftKey: string
}

export type DartDetailDescriptionApi = {
  task: DartTask
  openUrl: string | null
  supportsWritesV2: boolean
  description: DartDetailLoadState<string>
  readLatestTask(): Promise<DartClientResult<{ task: DartTask }>>
  onSavePatch(
    updates: DartUpdateTaskDescriptionArgs['updates']
  ): Promise<DartWriteResult<{ task: DartTask }>>
  registerCloseGuard(guard: () => boolean | Promise<boolean>): () => void
  /** Writes queued or in flight: Save stays disabled, or a second patch could insert text twice. */
  pendingFields: ReadonlySet<string>
  blockedFields: ReadonlySet<string>
  /** Task-wide: act on it only when `notice.notice?.field === 'description'`. */
  notice: DartNoticeApi
  draftKey: string
}

/** Dialog fields of T7's create dialog; every select holds a canonical name from the config. */
export type DartCreateDraft = {
  title: string
  dartboard: string
  description: string
  type: string
  status: string
  priority: string
  assignee: string
  tags: readonly string[]
  dueAt: string
}

export type DartCreateTaskModel = {
  createOpen: boolean
  createSupportsWritesV2: boolean
  createSubmitting: boolean
  openCreate(): void
  closeCreate(): void
  createTask(input: DartCreateTaskArgs): Promise<DartWriteResult<{ task: DartTask }>>
  createDraft: DartCreateDraft
  setCreateDraft(patch: Partial<DartCreateDraft>): void
  createNotice: DartWriteNotice | null
  listChecked: boolean
  createMatches: readonly DartTask[]
  createMatchesTruncated: boolean
  canCreateAnyway: boolean
  dismissCreateNotice(): void
  checkAgain(): Promise<void>
  dismissMatches(): void
  createAnyway(): Promise<DartWriteResult<{ task: DartTask }>>
}
