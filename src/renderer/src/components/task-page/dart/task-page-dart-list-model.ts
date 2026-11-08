import { isTrustedDartHtmlUrl } from '../../../../../shared/dart/dart-issue-url'
import type { DartBoardFilters } from '../../../../../shared/dart/dart-saved-views'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import { DART_LIST_PAGE_DEFAULT } from '../../../../../shared/rpc-contract/dart-params'
import type { DartListTasksArgs } from '../../../../../shared/rpc-contract/dart-params'
import { translate } from '@/i18n/i18n'
import { DART_OPEN_PAGE_COUNT, DART_OPEN_PAGE_SIZE } from '@/store/slices/dart/dart-scope-paging'
import type { DartClientFilters, DartScopeMeta, DartServerFilters } from './dart-board-contracts'

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

export const DEFAULT_DART_BOARD_FILTERS: DartBoardFilters = {
  ...DEFAULT_DART_LIST_FILTERS,
  tag: null,
  priority: null,
  onHold: false
}

/** D2.7: server filters start a read; client filters only narrow the loaded rows. */
export function splitDartBoardFilters(filters: DartBoardFilters): {
  server: DartServerFilters
  client: DartClientFilters
} {
  const { mine, dartboard, search, status, tag, priority, onHold } = filters
  return { server: { mine, dartboard, search }, client: { status, tag, priority, onHold } }
}

export function hasDartClientFilter(client: DartClientFilters): boolean {
  return Boolean(client.status || client.tag || client.priority || client.onHold)
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

export type DartCountLine = { text: string; offersRefresh: boolean }

/** D2.11 and D2.4: what the board host's header says about the loaded read set. */
export function buildDartCountLine(args: {
  meta: DartScopeMeta
  loadedOpen: number
  loadedDone: number
  clientFilterActive: boolean
}): DartCountLine {
  const { meta, loadedOpen, loadedDone, clientFilterActive } = args
  const cap = DART_OPEN_PAGE_SIZE * DART_OPEN_PAGE_COUNT
  const total = meta.openTotal.toLocaleString()
  if (meta.incomplete) {
    return {
      text: translate(
        'auto.components.task.page.dart.task-page-dart-list-model.countIncomplete',
        'About {{open}} open tasks (Dart changed during the read) ·',
        { open: loadedOpen.toLocaleString() }
      ),
      offersRefresh: true
    }
  }
  if (meta.openTotal > cap) {
    return {
      text: clientFilterActive
        ? translate(
            'auto.components.task.page.dart.task-page-dart-list-model.countFiltering',
            'Filtering the first {{cap}} of {{total}} open tasks.',
            { cap: cap.toLocaleString(), total }
          )
        : translate(
            'auto.components.task.page.dart.task-page-dart-list-model.countCut',
            'Showing {{cap}} of {{total}} open tasks. Pick a dartboard, Mine or search to narrow.',
            { cap: cap.toLocaleString(), total }
          ),
      offersRefresh: false
    }
  }
  return {
    text: translate(
      'auto.components.task.page.dart.task-page-dart-list-model.countOpenOf',
      '{{open}} open of {{total}} · {{done}} latest done',
      { open: loadedOpen.toLocaleString(), total, done: loadedDone.toLocaleString() }
    ),
    offersRefresh: false
  }
}
