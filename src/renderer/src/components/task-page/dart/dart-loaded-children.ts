import type { DartTask } from '../../../../../shared/dart/dart-types'

function updatedAtMs(task: DartTask): number {
  const ms = task.updatedAt ? Date.parse(task.updatedAt) : Number.NaN
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms
}

export type DartReconciledTasks = {
  /** The task's newest copy across scope and children entries, or the task itself when unknown. */
  newestOf(task: DartTask): DartTask
  /** Scope ids in first-appearance order, each as its newest copy, without a parent. */
  topLevel: readonly DartTask[]
  /** Newest copies whose own `parentId` is `parentId`: each task sits under one parent only. */
  childrenOf(parentId: string): readonly DartTask[]
  /** Scope ids, whether or not their newest copy has a parent. */
  scopeIds: ReadonlySet<string>
}

const NO_TASKS: readonly DartTask[] = []

/**
 * One task set for the board and the nested list (D13): every id keeps its newest copy across
 * `scopeRows` and all `childrenEntries` (the first on a tie or a missing `updatedAt`, scope first).
 * Cached copies never become top level; they only appear as children.
 */
export function reconcileDartTasks(
  scopeRows: readonly DartTask[],
  childrenEntries: readonly (readonly DartTask[])[]
): DartReconciledTasks {
  const newest = new Map<string, DartTask>()
  const scopeIds = new Set<string>()
  const consider = (task: DartTask): void => {
    const held = newest.get(task.id)
    if (!held || updatedAtMs(task) > updatedAtMs(held)) {
      newest.set(task.id, task)
    }
  }
  for (const task of scopeRows) {
    scopeIds.add(task.id)
    consider(task)
  }
  for (const entry of childrenEntries) {
    for (const task of entry) {
      consider(task)
    }
  }

  const byParent = new Map<string, DartTask[]>()
  for (const task of newest.values()) {
    if (task.parentId) {
      const siblings = byParent.get(task.parentId) ?? []
      siblings.push(task)
      byParent.set(task.parentId, siblings)
    }
  }
  const topLevel = [...scopeIds].flatMap((id) => {
    const task = newest.get(id)
    return task && !task.parentId ? [task] : []
  })
  return {
    newestOf: (task) => newest.get(task.id) ?? task,
    topLevel,
    childrenOf: (parentId) => byParent.get(parentId) ?? NO_TASKS,
    scopeIds
  }
}

/** The task lists of every read children entry under `childrenKeyPrefix`, for `reconcileDartTasks`. */
export function collectDartChildrenEntries(
  listCache: Readonly<Record<string, { data?: { tasks: readonly DartTask[] } | null }>>,
  childrenKeyPrefix: string
): (readonly DartTask[])[] {
  const entries: (readonly DartTask[])[] = []
  for (const [key, entry] of Object.entries(listCache)) {
    if (key.startsWith(childrenKeyPrefix) && entry.data) {
      entries.push(entry.data.tasks)
    }
  }
  return entries
}

/** Loaded children of `parentId`, each id counted once under the parent of its newest copy. */
export function dartLoadedChildren(
  parentId: string,
  scopeRows: readonly DartTask[],
  childrenEntries: readonly (readonly DartTask[])[]
): DartTask[] {
  return [...reconcileDartTasks(scopeRows, childrenEntries).childrenOf(parentId)]
}
