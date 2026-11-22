import type { DartTask } from '../../../../../shared/dart/dart-types'
import {
  getTaskSourceCacheScope,
  type TaskSourceContext
} from '../../../../../shared/work-items/task-source-context'

export type WorktreeNavHistoryDartTaskDetailEntry = {
  kind: 'task-detail'
  source: 'dart'
  task: DartTask
  sourceContext?: TaskSourceContext | null
}

export function getDartTaskDetailHistoryKey(entry: WorktreeNavHistoryDartTaskDetailEntry): string {
  const sourceScope =
    entry.sourceContext?.provider === 'dart'
      ? getTaskSourceCacheScope(entry.sourceContext)
      : 'legacy'
  return `view:task-detail:dart:${sourceScope}:${entry.task.id}`
}
