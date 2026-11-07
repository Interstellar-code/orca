import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { RpcParams } from './dart-fake-rpc-params.test-support'

const DEFAULT_PAGE_SIZE = 100
const MAX_PAGE_SIZE = 250

const SORT_KEYS: Record<string, (task: DartTask) => string | null | undefined> = {
  dartboard__order: (task) => task.dartboard,
  updated_at: (task) => task.updatedAt,
  created_at: (task) => task.createdAt,
  title: (task) => task.title,
  completed_at: (task) => task.completedAt
}

/** How the fake host shapes a page, as a real host's quirks do. */
export type FakeDartPagingQuirks = {
  /** Display name `assigneeId` resolves to; null applies no assignee filter. */
  assignee: string | null
  unmappableIds: ReadonlySet<string>
  unmappablePerPage: number
  maxRowsPerPage: number | null
  omitRaw: boolean
}

/** Rows without the sort field go last in both directions. */
function sortedBy(tasks: DartTask[], order: string | undefined): DartTask[] {
  const descending = order?.startsWith('-') ?? false
  const field = order?.replace(/^-/, '')
  if (!field || field === 'order') {
    return tasks
  }
  const key = SORT_KEYS[field]
  if (!key) {
    throw new Error(`fake Dart host cannot sort by ${field}`)
  }
  return [...tasks].sort((a, b) => {
    const x = key(a)
    const y = key(b)
    if (!x || !y) {
      return x ? -1 : y ? 1 : 0
    }
    return x === y ? 0 : (x < y ? -1 : 1) * (descending ? -1 : 1)
  })
}

export function pageFakeDartTasks(
  tasks: Iterable<DartTask>,
  params: RpcParams,
  quirks: FakeDartPagingQuirks
): object {
  const { assignee } = quirks
  // A fixture with no assignee or dartboard matches any filter on them, as phase 2's fake did.
  const filtered = sortedBy(
    [...tasks].filter(
      (task) =>
        (!params.status || task.status === params.status) &&
        (!params.tag || task.tags.includes(params.tag)) &&
        (!params.priority || task.priority === params.priority) &&
        (!params.dartboard ||
          !task.dartboard ||
          task.dartboard.toLowerCase() === params.dartboard.toLowerCase()) &&
        (!params.title || task.title.toLowerCase().includes(params.title.toLowerCase())) &&
        (assignee === null || !task.assignee || task.assignee === assignee) &&
        (params.isCompleted === undefined || Boolean(task.completedAt) === params.isCompleted)
    ),
    params.order
  )
  const offset = params.offset ?? 0
  const limit = Math.min(
    params.limit ?? DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    quirks.maxRowsPerPage ?? MAX_PAGE_SIZE
  )
  const rows = filtered.slice(offset, offset + limit)
  const keptRows = rows.slice(0, rows.length - Math.min(quirks.unmappablePerPage, rows.length))
  const page = keptRows
    .filter((task) => !quirks.unmappableIds.has(task.id))
    .map(({ description: _omitted, ...row }) => row)
  return {
    ok: true,
    tasks: page,
    totalCount: filtered.length - (rows.length - page.length),
    ...(quirks.omitRaw ? {} : { raw: { rowCount: rows.length, totalCount: filtered.length } })
  }
}
