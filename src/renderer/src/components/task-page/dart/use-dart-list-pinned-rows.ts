import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { DartAccountIdentity } from '@/store/slices/dart/dart-task-identity'
import { pendingDartPatches, subscribeDartTaskWrites } from './dart-task-write-queue'

export type PinnedDartRow = {
  row: DartTask
  /** A created row outlives the refresh that follows its create. */
  survivesNextClear: boolean
}

const NO_ROWS: readonly DartTask[] = []

// List rows never carry a description, but confirmed and evidence patches do.
function rowFieldsOf(patch: Partial<DartTask>): Partial<DartTask> {
  const { description: _description, ...fields } = patch
  return fields
}

/** The pinned rows the read did not return, with their pending edits applied. */
export function missingDartPinnedRows(
  tasks: readonly DartTask[],
  pinned: ReadonlyMap<string, PinnedDartRow>,
  account: DartAccountIdentity
): readonly DartTask[] {
  if (pinned.size === 0) {
    return NO_ROWS
  }
  const returned = new Set(tasks.map((row) => row.id))
  return [...pinned.values()]
    .filter((pin) => !returned.has(pin.row.id))
    .map((pin) => ({
      ...pin.row,
      ...rowFieldsOf(pendingDartPatches({ ...account, taskId: pin.row.id }))
    }))
}

/** D12: pinned rows missing from the read go on top of it, past `readFilter`, which narrows only the read rows; never writes to the store or to `tasks`. */
export function mergeDartPinnedRows(
  tasks: readonly DartTask[],
  pinned: ReadonlyMap<string, PinnedDartRow>,
  account: DartAccountIdentity,
  readFilter?: (read: readonly DartTask[]) => readonly DartTask[]
): readonly DartTask[] {
  const missing = missingDartPinnedRows(tasks, pinned, account)
  const read = readFilter ? readFilter(tasks) : tasks
  return missing.length === 0 ? read : [...missing, ...read]
}

function fieldsAlreadyApplied(row: DartTask, fields: Partial<DartTask>): boolean {
  const current = new Map(Object.entries(row))
  return Object.entries(fields).every(([key, value]) => Object.is(current.get(key), value))
}

type PinScope = { scopeKey: string; rows: Map<string, PinnedDartRow> }

const EMPTY_PINS: ReadonlyMap<string, PinnedDartRow> = new Map()

/** Holds edited and created rows per host and account until the next new list, for `mergeDartPinnedRows`. */
export function useDartListPinnedRows(args: {
  active: boolean
  hostKey: string
  accountKey: string
  tasks: readonly DartTask[]
  /** List-only modes patch their local copy here; the store path passes nothing. */
  onRowPatch?: (taskId: string, fields: Partial<DartTask>) => void
}): {
  pinnedRows: ReadonlyMap<string, PinnedDartRow>
  clearPinsOnNewList: (pinKey: string) => void
  noteDartTaskCreated: (task: DartTask) => void
} {
  const { active, hostKey, accountKey, tasks, onRowPatch } = args
  const scopeKey = JSON.stringify([hostKey, accountKey])
  const [snapshot, setSnapshot] = useState<PinScope>({ scopeKey, rows: new Map() })
  // Mutators read the latest pins synchronously, before React has rendered the snapshot.
  const pinsRef = useRef<PinScope>(snapshot)
  const pinKeyRef = useRef<string | null>(null)
  const tasksRef = useRef(tasks)
  const onRowPatchRef = useRef(onRowPatch)
  useEffect(() => {
    tasksRef.current = tasks
    onRowPatchRef.current = onRowPatch
  })

  const commit = useCallback(
    (rows: Map<string, PinnedDartRow>): void => {
      pinsRef.current = { scopeKey, rows }
      setSnapshot(pinsRef.current)
    },
    [scopeKey]
  )
  const currentRows = useCallback(
    (): Map<string, PinnedDartRow> =>
      pinsRef.current.scopeKey === scopeKey ? new Map(pinsRef.current.rows) : new Map(),
    [scopeKey]
  )

  // Drop the old scope's rows for good, so switching back never resurrects them.
  useEffect(() => {
    if (pinsRef.current.scopeKey !== scopeKey) {
      commit(new Map())
    }
  }, [scopeKey, commit])

  const pinnedRows = snapshot.scopeKey === scopeKey ? snapshot.rows : EMPTY_PINS

  // A re-read can move a pinned row's other fields, so keep the pin as fresh as the last read that returned it.
  useEffect(() => {
    const rows = currentRows()
    let changed = false
    for (const read of tasks) {
      const pin = rows.get(read.id)
      const row = {
        ...read,
        ...rowFieldsOf(pendingDartPatches({ hostKey, accountKey, taskId: read.id }))
      }
      if (pin && !fieldsAlreadyApplied(pin.row, row)) {
        rows.set(read.id, { ...pin, row })
        changed = true
      }
    }
    if (changed) {
      commit(rows)
    }
  }, [tasks, hostKey, accountKey, commit, currentRows])

  const subscribedIds = useMemo(
    () => JSON.stringify([...new Set([...tasks.map((row) => row.id), ...pinnedRows.keys()])]),
    [tasks, pinnedRows]
  )
  useEffect(() => {
    if (!active) {
      return
    }
    const applyToRow = (taskId: string, patch: Partial<DartTask>): void => {
      const fields = rowFieldsOf(patch)
      if (Object.keys(fields).length === 0) {
        return
      }
      const rows = currentRows()
      const pin = rows.get(taskId)
      const row = pin?.row ?? tasksRef.current.find((candidate) => candidate.id === taskId)
      if (row && !(pin && fieldsAlreadyApplied(pin.row, fields))) {
        rows.set(taskId, {
          row: { ...row, ...fields },
          survivesNextClear: pin?.survivesNextClear ?? false
        })
        commit(rows)
      }
      onRowPatchRef.current?.(taskId, fields)
    }
    const taskIds: string[] = JSON.parse(subscribedIds)
    const unsubscribes = taskIds.map((taskId) =>
      subscribeDartTaskWrites(
        { hostKey, accountKey, taskId },
        (update) => applyToRow(taskId, update.patch),
        (patch) => applyToRow(taskId, patch)
      )
    )
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe())
  }, [active, hostKey, accountKey, subscribedIds, commit, currentRows])

  /** A changed key means a refresh or a filter change: the user asked for Dart's list again. */
  const clearPinsOnNewList = useCallback(
    (pinKey: string): void => {
      if (pinKeyRef.current === pinKey) {
        return
      }
      pinKeyRef.current = pinKey
      const rows = currentRows()
      if (rows.size === 0) {
        return
      }
      for (const [taskId, pin] of rows) {
        if (pin.survivesNextClear) {
          rows.set(taskId, { ...pin, survivesNextClear: false })
        } else {
          rows.delete(taskId)
        }
      }
      commit(rows)
    },
    [commit, currentRows]
  )

  /** T7: the new row shows even when it does not match the filters, past the refresh that follows the create. */
  const noteDartTaskCreated = useCallback(
    (task: DartTask): void => {
      const { description: _description, ...row } = task
      const rows = currentRows()
      rows.set(task.id, { row, survivesNextClear: true })
      commit(rows)
    },
    [commit, currentRows]
  )

  return { pinnedRows, clearPinsOnNewList, noteDartTaskCreated }
}
