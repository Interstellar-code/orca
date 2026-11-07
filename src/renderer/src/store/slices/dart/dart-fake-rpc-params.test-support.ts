import type { DartSavedView } from '../../../../../shared/dart/dart-saved-views'

export type Failure = {
  ok: false
  error: string
  errorCode?: string
  outcome?: 'notApplied' | 'unknown'
}

export type RpcParams = {
  taskId?: string
  updates?: Record<string, unknown>
  text?: string
  parentId?: string
  title?: string
  status?: string
  tag?: string
  priority?: string
  dartboard?: string
  assignee?: string
  assigneeId?: string
  isCompleted?: boolean
  offset?: number
  limit?: number
  order?: string
  /** `ui.mutateDartSavedViews` sends the mutation itself as its params. */
  kind?: string
  view?: DartSavedView
  id?: string
  name?: string
}
