import { isTrustedDartHtmlUrl } from '../../../../../shared/dart/dart-issue-url'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import { DART_LIST_PAGE_DEFAULT } from '../../../../../shared/rpc-contract/dart-params'
import type { DartListTasksArgs } from '../../../../../shared/rpc-contract/dart-params'

export type DartListFilters = {
  mine: boolean
  status: string | null
  /** Full-path board title exactly as `dart.config` returns it; short names are ambiguous. */
  dartboard: string | null
  search: string
}

export const DEFAULT_DART_LIST_FILTERS: DartListFilters = {
  mine: true,
  status: null,
  dartboard: null,
  search: ''
}

// Why: Dart ignores unknown parameters and applies hidden workspace defaults, so every filter is sent explicitly.
// Why: without a viewer id "mine" has no assignee to filter by, and an unfiltered list would show everyone's tasks.
export function buildDartListArgs(
  filters: DartListFilters,
  viewerId: string | null | undefined
): NonNullable<DartListTasksArgs> | null {
  if (filters.mine && !viewerId) {
    return null
  }
  const args: NonNullable<DartListTasksArgs> = {
    limit: DART_LIST_PAGE_DEFAULT
  }
  if (filters.mine && viewerId) {
    args.assigneeId = viewerId
  }
  if (filters.status) {
    args.status = filters.status
  }
  if (filters.dartboard) {
    args.dartboard = filters.dartboard
  }
  const title = filters.search.trim()
  if (title) {
    args.title = title
  }
  return args
}

export function isDartListTruncated(loadedCount: number, totalCount: number): boolean {
  return loadedCount < totalCount
}

/** Host validation drops an untrusted link and leaves the task; re-checking keeps a bad URL from ever becoming a link. */
export function getDartTaskOpenUrl(task: Pick<DartTask, 'htmlUrl'>): string | null {
  return isTrustedDartHtmlUrl(task.htmlUrl) ? task.htmlUrl : null
}

export function sortDartTasksByRecency(tasks: readonly DartTask[]): DartTask[] {
  const stamp = (task: DartTask): number => {
    const time = task.updatedAt ? Date.parse(task.updatedAt) : Number.NaN
    return Number.isNaN(time) ? 0 : time
  }
  return tasks.toSorted((a, b) => stamp(b) - stamp(a))
}

export function getDartStatusTone(status: string | null | undefined): string {
  const name = status?.toLowerCase() ?? ''
  if (/(done|complete|closed|finish|resolved)/.test(name)) {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200'
  }
  if (/(doing|progress|review|started|active)/.test(name)) {
    return 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-200'
  }
  if (/(block|stuck|hold)/.test(name)) {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200'
  }
  return 'border-border/50 bg-muted/40 text-muted-foreground'
}

export function isDartAuthFailureCode(code: string | undefined): boolean {
  return code === 'dart.unauthorized' || code === 'dart.notConnected'
}
