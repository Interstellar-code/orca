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
  pendingFields: ReadonlySet<string>
  config: DartWorkspaceConfig | null
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
  openCreate(): void
  closeCreate(): void
  createTask(input: DartCreateTaskArgs): Promise<DartWriteResult<{ task: DartTask }>>
  createDraft: DartCreateDraft
  setCreateDraft(patch: Partial<DartCreateDraft>): void
  createNotice: DartWriteNotice | null
  listChecked: boolean
  createMatches: readonly DartTask[]
  checkAgain(): Promise<void>
  dismissMatches(): void
  createAnyway(): Promise<DartWriteResult<{ task: DartTask }>>
}
