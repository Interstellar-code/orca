import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { BuildDartTaskTree, DartNestedListRow } from './dart-board-contracts'

function updatedAtMs(task: DartTask): number {
  const ms = task.updatedAt ? Date.parse(task.updatedAt) : Number.NaN
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms
}

// Map insertion order keeps the first position; a strictly newer copy replaces the value.
function putNewest(target: Map<string, DartTask>, task: DartTask): void {
  const existing = target.get(task.id)
  if (!existing || updatedAtMs(task) > updatedAtMs(existing)) {
    target.set(task.id, task)
  }
}

export const buildDartTaskTree: BuildDartTaskTree = (tasks, children, opts) => {
  if (!opts.nested) {
    return {
      rows: tasks.map((task): DartNestedListRow => ({ task, depth: 0, parentId: null })),
      hiddenSubtasks: 0
    }
  }

  const scope = new Map<string, DartTask>()
  for (const task of tasks) {
    putNewest(scope, task)
  }

  const childrenByParent = new Map<string, Map<string, DartTask>>()
  const addChild = (parentId: string, child: DartTask): void => {
    const siblings = childrenByParent.get(parentId) ?? new Map<string, DartTask>()
    putNewest(siblings, child)
    childrenByParent.set(parentId, siblings)
  }
  for (const task of scope.values()) {
    if (task.parentId) {
      addChild(task.parentId, task)
    }
  }
  for (const [parentId, list] of children) {
    for (const child of list) {
      addChild(parentId, child)
    }
  }

  const topLevel = [...scope.values()].filter((task) => !task.parentId)
  const emitted = new Set(topLevel.map((task) => task.id))
  const rows: DartNestedListRow[] = []

  for (const root of topLevel) {
    rows.push({ task: root, depth: 0, parentId: null })
    const queue = [root.id]
    for (let index = 0; index < queue.length; index += 1) {
      for (const child of childrenByParent.get(queue[index])?.values() ?? []) {
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
  for (const id of scope.keys()) {
    if (!emitted.has(id)) {
      hiddenSubtasks += 1
    }
  }
  return { rows, hiddenSubtasks }
}
