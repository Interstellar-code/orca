import type { DartTask, DartWorkspaceConfig } from '../../../../../shared/dart/dart-types'
import type { DartBoardColumn, DartCardInfo, DartClientFilters } from './dart-board-contracts'

const ON_HOLD_STATUS = 'on hold'
const ON_HOLD_TAG = 'on-hold'

function fold(value: string | null | undefined): string {
  return (value ?? '').toLowerCase()
}

export function isDartTaskFinished(task: DartTask): boolean {
  return Boolean(task.completedAt)
}

export function isDartTaskOnHold(task: DartTask): boolean {
  return fold(task.status) === ON_HOLD_STATUS || task.tags.some((tag) => fold(tag) === ON_HOLD_TAG)
}

export function hasDartOnHoldOption(config: DartWorkspaceConfig): boolean {
  return (
    config.statuses.some((status) => fold(status) === ON_HOLD_STATUS) ||
    config.tags.some((tag) => fold(tag) === ON_HOLD_TAG)
  )
}

function finishedTime(task: DartTask): number {
  const time = Date.parse(task.completedAt ?? '')
  return Number.isNaN(time) ? 0 : time
}

function compareFinished(a: DartTask, b: DartTask): number {
  return finishedTime(b) - finishedTime(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

// Open tasks keep read order; finished follow, newest first (D7).
function orderColumnTasks(tasks: readonly DartTask[]): DartTask[] {
  const open = tasks.filter((task) => !isDartTaskFinished(task))
  const finished = tasks.filter(isDartTaskFinished).sort(compareFinished)
  return [...open, ...finished]
}

export function buildDartBoardColumns(
  tasks: readonly DartTask[],
  config: DartWorkspaceConfig,
  opts: { showEmptyColumns: boolean }
): DartBoardColumn[] {
  const configStatuses = new Map<string, string>()
  for (const status of config.statuses) {
    if (!configStatuses.has(fold(status))) {
      configStatuses.set(fold(status), status)
    }
  }

  const buckets = new Map<string, { status: string; inConfig: boolean; tasks: DartTask[] }>()
  for (const [key, status] of configStatuses) {
    buckets.set(key, { status, inConfig: true, tasks: [] })
  }
  const extras: string[] = []
  for (const task of tasks) {
    if (!task.status) {
      continue
    }
    const key = fold(task.status)
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { status: task.status, inConfig: false, tasks: [] }
      buckets.set(key, bucket)
      extras.push(key)
    }
    bucket.tasks.push(task)
  }

  return [...configStatuses.keys(), ...extras]
    .map((key) => ({ key, bucket: buckets.get(key) }))
    .flatMap(({ key, bucket }) => {
      if (!bucket || (bucket.tasks.length === 0 && !opts.showEmptyColumns)) {
        return []
      }
      const ordered = orderColumnTasks(bucket.tasks)
      return [
        {
          key: `status:${key}`,
          status: bucket.status,
          inConfig: bucket.inConfig,
          tasks: ordered,
          count: ordered.length
        }
      ]
    })
}

export function buildDartCardInfo(task: DartTask): DartCardInfo {
  return { task, onHold: isDartTaskOnHold(task) }
}

export function applyDartBoardFilters(
  tasks: readonly DartTask[],
  filters: DartClientFilters
): DartTask[] {
  const status = filters.status === null ? null : fold(filters.status)
  const tag = filters.tag === null ? null : fold(filters.tag)
  const priority = filters.priority === null ? null : fold(filters.priority)
  return tasks.filter(
    (task) =>
      (status === null || fold(task.status) === status) &&
      (tag === null || task.tags.some((value) => fold(value) === tag)) &&
      (priority === null || fold(task.priority) === priority) &&
      (!filters.onHold || isDartTaskOnHold(task))
  )
}
