import type { DartTask, DartWorkspaceConfig } from '../../../../../shared/dart/dart-types'
import type {
  DartBoardColumn,
  DartCardInfo,
  DartClientFilters,
  DartRelationshipCacheEntry
} from './dart-board-contracts'

const ON_HOLD_STATUS = 'on hold'
const ON_HOLD_TAG = 'on-hold'
const NO_STATUS_KEY = 'no-status'

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
  opts: { showEmptyColumns: boolean; nested?: boolean }
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
  const noStatus: DartTask[] = []
  for (const task of tasks) {
    if (opts.nested && task.parentId) {
      continue
    }
    if (!task.status) {
      noStatus.push(task)
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

  const columns = [...configStatuses.keys(), ...extras].flatMap((key) => {
    const bucket = buckets.get(key)
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
  if (noStatus.length > 0) {
    const ordered = orderColumnTasks(noStatus)
    columns.push({
      key: NO_STATUS_KEY,
      status: '',
      inConfig: false,
      tasks: ordered,
      count: ordered.length
    })
  }
  return columns
}

// D14.3: a missing entry on a relationships host is "not checked", never "not blocked".
export function dartRelationshipEntryFor(
  task: DartTask,
  cache: ReadonlyMap<string, DartRelationshipCacheEntry> | undefined,
  relationshipsHost: boolean
): DartRelationshipCacheEntry | undefined {
  const cached = cache?.get(task.id)
  if (cached) {
    return cached
  }
  return relationshipsHost && isDartTaskOnHold(task)
    ? { state: 'notChecked', relationships: null, fetchedAt: 0, error: null }
    : undefined
}

export function buildDartCardInfo(
  task: DartTask,
  relationships?: DartRelationshipCacheEntry,
  loadedChildren?: readonly DartTask[]
): DartCardInfo {
  const onHold = isDartTaskOnHold(task)
  if (!relationships && !loadedChildren) {
    return { task, onHold }
  }
  const known = relationships?.state === 'known' ? relationships.relationships : null
  // Markers are on-hold only (D14); a blocker count is never 0 unless it was actually read.
  const markers =
    onHold && relationships
      ? {
          relationshipState: relationships.state,
          blockedBy: known ? known.blockerIds.length : null,
          blocking: known ? known.blockingIds.length : null
        }
      : {}
  // Totals come from subtaskIds when known (D13.5), else only the loaded count is shown.
  const subtasks = known
    ? { loaded: loadedChildren?.length ?? 0, total: known.subtaskIds.length }
    : loadedChildren
      ? { loaded: loadedChildren.length, total: null }
      : undefined
  return { task, onHold, ...markers, ...(subtasks ? { subtasks } : {}) }
}

// On-hold with no read result stays visible: it may be blocked.
function isOnHoldBlockedOrUnchecked(
  task: DartTask,
  relationships: ReadonlyMap<string, DartRelationshipCacheEntry> | undefined
): boolean {
  if (!isDartTaskOnHold(task)) {
    return false
  }
  const entry = relationships?.get(task.id)
  if (entry?.state !== 'known' || !entry.relationships) {
    return true
  }
  return entry.relationships.blockerIds.length > 0
}

export function applyDartBoardFilters(
  tasks: readonly DartTask[],
  filters: DartClientFilters,
  relationships?: ReadonlyMap<string, DartRelationshipCacheEntry>
): DartTask[] {
  const status = filters.status === null ? null : fold(filters.status)
  const tag = filters.tag === null ? null : fold(filters.tag)
  const priority = filters.priority === null ? null : fold(filters.priority)
  return tasks.filter(
    (task) =>
      (status === null || fold(task.status) === status) &&
      (tag === null || task.tags.some((value) => fold(value) === tag)) &&
      (priority === null || fold(task.priority) === priority) &&
      (!filters.onHold || isDartTaskOnHold(task)) &&
      (!filters.blockedOnHold || isOnHoldBlockedOrUnchecked(task, relationships))
  )
}
