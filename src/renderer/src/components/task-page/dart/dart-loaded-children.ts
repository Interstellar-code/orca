import type { DartTask } from '../../../../../shared/dart/dart-types'

function updatedAtMs(task: DartTask): number {
  const ms = task.updatedAt ? Date.parse(task.updatedAt) : Number.NaN
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms
}

/**
 * Loaded children of `parentId`.
 * `scopeRows`: the page's task rows. `childrenEntries`: the task lists of any read children cache entries.
 * Each id keeps its newest copy across both sources (the first on a tie), so a child that moved to
 * another parent in a newer copy drops out; order follows first appearance.
 */
export function dartLoadedChildren(
  parentId: string,
  scopeRows: readonly DartTask[],
  childrenEntries: readonly (readonly DartTask[])[]
): DartTask[] {
  const newest = new Map<string, DartTask>()
  for (const task of [...scopeRows, ...childrenEntries.flat()]) {
    const held = newest.get(task.id)
    if (!held || updatedAtMs(task) > updatedAtMs(held)) {
      newest.set(task.id, task)
    }
  }
  return [...newest.values()].filter((task) => task.parentId === parentId)
}
