import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { DartAccountIdentity } from '@/store/slices/dart/dart-task-identity'
import {
  pendingDartPatches,
  subscribeDartTaskWrites,
  withPendingDartPatches
} from './dart-task-write-queue'

type PinnedDartRow = {
  row: DartTask
  /** A created row outlives the refresh that follows its create. */
  survivesNextClear: boolean
}

type DartListRead = {
  tasks: DartTask[]
  totalCount: number
  error: unknown
}

// List rows never carry a description, but confirmed and evidence patches do.
function rowFieldsOf(patch: Partial<DartTask>): Partial<DartTask> {
  const { description: _description, ...fields } = patch
  return fields
}

/** D11: an edited row stays listed even when a re-read no longer returns it. */
function mergeDartListRead<T extends DartListRead>(
  outcome: T,
  pinned: Map<string, PinnedDartRow>,
  account: DartAccountIdentity
): T {
  if (outcome.error && outcome.tasks.length === 0) {
    return outcome
  }
  const tasks = withPendingDartPatches(outcome.tasks, account)
  for (const row of tasks) {
    const pin = pinned.get(row.id)
    if (pin) {
      pin.row = row
    }
  }
  const returned = new Set(tasks.map((row) => row.id))
  const kept = [...pinned.values()]
    .filter((pin) => !returned.has(pin.row.id))
    .map((pin) => ({
      ...pin.row,
      ...rowFieldsOf(pendingDartPatches({ ...account, taskId: pin.row.id }))
    }))
  return {
    ...outcome,
    tasks: [...tasks, ...kept],
    totalCount: outcome.totalCount + kept.length
  }
}

/** Patches the list's rows from the write queue and holds edited rows until the next refresh or filter change. */
export function useDartListPinnedRows(args: {
  active: boolean
  hostKey: string
  accountKey: string
  dartTasks: readonly DartTask[]
  setDartTasks: Dispatch<SetStateAction<DartTask[]>>
  setDartTotalCount: Dispatch<SetStateAction<number>>
}) {
  const { active, hostKey, accountKey, dartTasks, setDartTasks, setDartTotalCount } = args
  const pinnedRowsRef = useRef(new Map<string, PinnedDartRow>())
  const pinKeyRef = useRef<string | null>(null)
  const dartTasksRef = useRef(dartTasks)
  useEffect(() => {
    dartTasksRef.current = dartTasks
  })

  const rowIdsSignature = JSON.stringify(dartTasks.map((row) => row.id))
  useEffect(() => {
    if (!active) {
      return
    }
    const applyToRow = (taskId: string, patch: Partial<DartTask>): void => {
      const fields = rowFieldsOf(patch)
      if (Object.keys(fields).length === 0) {
        return
      }
      const pin = pinnedRowsRef.current.get(taskId)
      const row = pin?.row ?? dartTasksRef.current.find((candidate) => candidate.id === taskId)
      if (row) {
        pinnedRowsRef.current.set(taskId, {
          row: { ...row, ...fields },
          survivesNextClear: pin?.survivesNextClear ?? false
        })
      }
      setDartTasks((rows) =>
        rows.map((candidate) => (candidate.id === taskId ? { ...candidate, ...fields } : candidate))
      )
    }
    const taskIds: string[] = JSON.parse(rowIdsSignature)
    const unsubscribes = taskIds.map((taskId) =>
      subscribeDartTaskWrites(
        { hostKey, accountKey, taskId },
        (update) => applyToRow(taskId, update.patch),
        (patch) => applyToRow(taskId, patch)
      )
    )
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe())
  }, [active, hostKey, accountKey, rowIdsSignature, setDartTasks])

  /** A changed key means a refresh or a filter change: the user asked for Dart's list again. */
  const clearPinsOnNewList = useCallback((pinKey: string): void => {
    if (pinKeyRef.current === pinKey) {
      return
    }
    pinKeyRef.current = pinKey
    for (const [taskId, pin] of pinnedRowsRef.current) {
      if (pin.survivesNextClear) {
        pin.survivesNextClear = false
      } else {
        pinnedRowsRef.current.delete(taskId)
      }
    }
  }, [])

  const mergeListRead = useCallback(
    <T extends DartListRead>(outcome: T): T =>
      mergeDartListRead(outcome, pinnedRowsRef.current, { hostKey, accountKey }),
    [hostKey, accountKey]
  )

  /** T7: the new row shows even when it does not match the filters, past the refresh that follows the create. */
  const noteDartTaskCreated = useCallback(
    (task: DartTask) => {
      const { description: _description, ...row } = task
      pinnedRowsRef.current.set(task.id, { row, survivesNextClear: true })
      setDartTasks((rows) => [row, ...rows.filter((candidate) => candidate.id !== task.id)])
      setDartTotalCount((count) => count + 1)
    },
    [setDartTasks, setDartTotalCount]
  )

  return { clearPinsOnNewList, mergeListRead, noteDartTaskCreated }
}
