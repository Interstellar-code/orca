import type { DartTask, DartTaskPage } from '../../../../../shared/dart/dart-types'
import {
  DART_LIST_PAGE_MAX,
  type DartListTasksArgs
} from '../../../../../shared/rpc-contract/dart-params'
import type { DartScopeReadResult } from '@/components/task-page/dart/dart-board-contracts'
import { translate } from '@/i18n/i18n'
import type { DartClientFailure, DartClientResult } from '@/runtime/runtime-dart-client'

export const DART_OPEN_PAGE_SIZE = DART_LIST_PAGE_MAX
export const DART_OPEN_PAGE_COUNT = 4
export const DART_DONE_PAGE_SIZE = 50

export type DartScopePageArgs = NonNullable<DartListTasksArgs>

export type DartScopePageReader = (
  args: DartScopePageArgs
) => Promise<DartClientResult<DartTaskPage>>

type ScopeFailure = NonNullable<DartScopeReadResult['failure']>

export function dartScopeFailure(failure: DartClientFailure): ScopeFailure {
  return {
    reason: failure.errorCode === 'dart.rateLimited' ? 'rateLimited' : 'error',
    message: failure.error
  }
}

export function missingRowCountsFailure(): DartClientFailure {
  return {
    ok: false,
    error: translate(
      'auto.store.slices.dart.dart-scope-paging.missingRowCounts',
      'Dart did not report how many tasks it sent. Update the Orca server and try again.'
    )
  }
}

function updatedAtMillis(task: DartTask): number {
  return task.updatedAt ? Date.parse(task.updatedAt) : Number.NaN
}

/** The newer `updatedAt` wins (a tie or an unreadable date: the incoming row) and keeps the first position. */
export function mergeDartScopeTasks(
  existing: readonly DartTask[],
  incoming: readonly DartTask[]
): { tasks: DartTask[]; repeated: boolean } {
  const tasks = [...existing]
  const positions = new Map(tasks.map((task, index) => [task.id, index]))
  let repeated = false
  for (const task of incoming) {
    const position = positions.get(task.id)
    if (position === undefined) {
      positions.set(task.id, tasks.length)
      tasks.push(task)
      continue
    }
    repeated = true
    const held = updatedAtMillis(tasks[position])
    const next = updatedAtMillis(task)
    if (Number.isNaN(held) || Number.isNaN(next) || next >= held) {
      tasks[position] = task
    }
  }
  return { tasks, repeated }
}

/** Reads the open pages one after another, then the first finished page; cursors advance by raw row counts. */
export async function readDartScopePages(
  baseArgs: NonNullable<DartListTasksArgs>,
  readPage: DartScopePageReader
): Promise<DartScopeReadResult> {
  let tasks: DartTask[] = []
  let repeated = false
  let offset = 0
  let openTotal = 0
  let pagesRead = 0
  let cutByPageCap = false
  let countMoved = false
  const fail = (failure: DartClientFailure): DartScopeReadResult => ({
    tasks,
    openTotal,
    doneTotal: 0,
    doneOffset: 0,
    incomplete: true,
    failure: dartScopeFailure(failure)
  })
  const absorb = (page: DartTaskPage): void => {
    const merged = mergeDartScopeTasks(tasks, page.tasks)
    tasks = merged.tasks
    repeated ||= merged.repeated
  }

  for (;;) {
    const page = await readPage({
      ...baseArgs,
      isCompleted: false,
      order: 'order',
      limit: DART_OPEN_PAGE_SIZE,
      offset
    })
    if (!page.ok) {
      return fail(page)
    }
    if (!page.raw) {
      return fail(missingRowCountsFailure())
    }
    absorb(page)
    countMoved ||= pagesRead > 0 && page.raw.totalCount !== openTotal
    pagesRead += 1
    offset += page.raw.rowCount
    openTotal = page.raw.totalCount
    if (page.raw.rowCount < DART_OPEN_PAGE_SIZE || offset >= openTotal) {
      break
    }
    if (pagesRead === DART_OPEN_PAGE_COUNT) {
      cutByPageCap = true
      break
    }
  }
  const openMapped = tasks.length
  // An uncut read must map exactly Dart's count; a moved count or a missing or unmappable row breaks that.
  const openIncomplete = countMoved || (!cutByPageCap && openMapped !== openTotal)

  const done = await readPage({
    ...baseArgs,
    isCompleted: true,
    order: '-completed_at',
    limit: DART_DONE_PAGE_SIZE,
    offset: 0
  })
  if (!done.ok) {
    return fail(done)
  }
  if (!done.raw) {
    return fail(missingRowCountsFailure())
  }
  absorb(done)
  const doneShort =
    done.raw.rowCount < DART_DONE_PAGE_SIZE && done.raw.rowCount < done.raw.totalCount
  return {
    tasks,
    openTotal,
    doneTotal: done.raw.totalCount,
    doneOffset: done.raw.rowCount,
    incomplete: openIncomplete || doneShort || repeated,
    failure: null
  }
}
