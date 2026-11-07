import type { DartHostFeatures, DartTask } from '../../../../../shared/dart/dart-types'
import type { DartBoardFilters, DartSavedView } from '../../../../../shared/dart/dart-saved-views'
import type { DartWriteResult } from '@/runtime/runtime-dart-write-client'

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

export type DartCardInfo = { readonly task: DartTask; readonly onHold: boolean }

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
