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

  const scopeIds = new Set(tasks.map((task) => task.id))
  // Dedupe by id across scope and children map first so a stale copy never decides placement.
  const newest = new Map<string, DartTask>()
  const parentOf = new Map<string, string | null>()
  const consider = (task: DartTask, fallbackParent: string | null): void => {
    const before = newest.get(task.id)
    putNewest(newest, task)
    if (newest.get(task.id) !== before) {
      parentOf.set(task.id, task.parentId || fallbackParent)
    }
  }
  for (const task of tasks) {
    consider(task, null)
  }
  for (const [parentId, list] of children) {
    for (const child of list) {
      consider(child, parentId)
    }
  }

  const childrenByParent = new Map<string, DartTask[]>()
  for (const [id, task] of newest) {
    const parentId = parentOf.get(id)
    if (parentId) {
      const siblings = childrenByParent.get(parentId) ?? []
      siblings.push(task)
      childrenByParent.set(parentId, siblings)
    }
  }

  const topLevel = [...scopeIds].flatMap((id) => {
    const task = newest.get(id)
    return task && !parentOf.get(id) ? [task] : []
  })
  const emitted = new Set(topLevel.map((task) => task.id))
  const rows: DartNestedListRow[] = []

  for (const root of topLevel) {
    rows.push({ task: root, depth: 0, parentId: null })
    const queue = [root.id]
    for (let index = 0; index < queue.length; index += 1) {
      for (const child of childrenByParent.get(queue[index]) ?? []) {
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
  for (const id of scopeIds) {
    if (!emitted.has(id)) {
      hiddenSubtasks += 1
    }
  }
  return { rows, hiddenSubtasks }
}
