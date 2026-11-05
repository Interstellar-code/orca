import type { DartTask, DartWorkspaceConfig } from '../../../../../shared/dart/dart-types'
import { checkDartRequestText } from '../../../../../shared/dart/dart-text-limits'
import type { DartCreateTaskArgs } from '../../../../../shared/rpc-contract/dart-params'
import { translate } from '@/i18n/i18n'
import { dartTextTooLargeMessage } from '@/runtime/runtime-dart-write-client'
import { isDartListTruncated } from './task-page-dart-list-model'
import type { DartCreateDraft } from './dart-detail-contracts'

export const EMPTY_DART_CREATE_DRAFT: DartCreateDraft = {
  title: '',
  dartboard: '',
  description: '',
  type: '',
  status: '',
  priority: '',
  assignee: '',
  tags: [],
  dueAt: ''
}

/** Only the fields the user filled in go on the wire; Dart applies its own defaults for the rest. */
export function dartCreateArgs(
  draft: DartCreateDraft,
  supportsWritesV2: boolean
): DartCreateTaskArgs {
  return {
    title: draft.title.trim(),
    dartboard: draft.dartboard,
    ...(draft.description ? { description: draft.description } : {}),
    ...(draft.type ? { type: draft.type } : {}),
    ...(draft.status ? { status: draft.status } : {}),
    ...(draft.priority ? { priority: draft.priority } : {}),
    ...(draft.assignee ? { assignee: draft.assignee } : {}),
    ...(draft.tags.length ? { tags: [...draft.tags] } : {}),
    ...(draft.dueAt && supportsWritesV2 ? { dueAt: draft.dueAt } : {})
  }
}

/** Dart's title filter is a case-insensitive substring, so the exact title is compared here. */
export function dartCreateTitleMatches(draftTitle: string, taskTitle: string): boolean {
  return draftTitle.trim() === taskTitle.trim()
}

/** The boards this workspace knows; an unknown board never reaches Dart, whose default is unknown. */
export function dartCreateBoardRefusal(
  dartboard: string,
  dartConfig: DartWorkspaceConfig | null
): string {
  const boards = dartConfig?.dartboards ?? []
  if (dartboard && boards.includes(dartboard)) {
    return ''
  }
  return translate(
    'auto.components.task.page.dart.TaskCreateDialog.boardRequired',
    'Choose a dartboard from this workspace.'
  )
}

/** The reason a create cannot be sent, or an empty string when it can. */
export function dartCreateRefusal(
  title: string,
  description: string | undefined,
  dartboard: string,
  dartConfig: DartWorkspaceConfig | null
): string {
  if (!title) {
    return translate(
      'auto.components.task.page.dart.TaskCreateDialog.titleRequired',
      'Title is required.'
    )
  }
  const boardRefusal = dartCreateBoardRefusal(dartboard, dartConfig)
  if (boardRefusal) {
    return boardRefusal
  }
  for (const field of ['title', 'description'] as const) {
    const value = field === 'title' ? title : description
    if (typeof value !== 'string') {
      continue
    }
    const check = checkDartRequestText(field, value)
    if (!check.ok) {
      return dartTextTooLargeMessage({
        amount: check.size,
        limit: check.limit,
        unit: check.unit
      })
    }
  }
  return ''
}

/** The exact-title matches of a lookup page; a title that only contains the wanted one is not one. */
export function dartCreateMatches(
  title: string,
  tasks: readonly DartTask[],
  totalCount: number | undefined
): { matches: DartTask[]; truncated: boolean } {
  return {
    matches: tasks.filter((task) => dartCreateTitleMatches(title, task.title)),
    truncated: isDartListTruncated(tasks.length, totalCount ?? tasks.length)
  }
}
