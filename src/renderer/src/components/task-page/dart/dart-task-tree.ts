import type { BuildDartTaskTree, DartNestedListRow } from './dart-board-contracts'
import { reconcileDartTasks, type DartReconciledTasks } from './dart-loaded-children'

/** Nested rows of a reconciled set; descendants of a root sit at depth 1 in breadth-first order. */
export function buildDartNestedRows(set: DartReconciledTasks): {
  rows: DartNestedListRow[]
  hiddenSubtasks: number
} {
  const emitted = new Set(set.topLevel.map((task) => task.id))
  const rows: DartNestedListRow[] = []
  for (const root of set.topLevel) {
    rows.push({ task: root, depth: 0, parentId: null })
    const queue = [root.id]
    for (let index = 0; index < queue.length; index += 1) {
      for (const child of set.childrenOf(queue[index])) {
        if (emitted.has(child.id)) {
          continue
        }
        emitted.add(child.id)
        rows.push({ task: child, depth: 1, parentId: root.id })
        queue.push(child.id)
      }
    }
  }

  // Unloaded parents and parentId cycles never reach a top-level ancestor, so they count as hidden.
  let hiddenSubtasks = 0
  for (const id of set.scopeIds) {
    if (!emitted.has(id)) {
      hiddenSubtasks += 1
    }
  }
  return { rows, hiddenSubtasks }
}

export const buildDartTaskTree: BuildDartTaskTree = (tasks, children, opts) => {
  if (!opts.nested) {
    return {
      rows: tasks.map((task): DartNestedListRow => ({ task, depth: 0, parentId: null })),
      hiddenSubtasks: 0
    }
  }
  return buildDartNestedRows(reconcileDartTasks(tasks, [...children.values()]))
}
