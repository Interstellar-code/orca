import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { DartReadScope } from '@/store/slices/dart/dart-read-coordination'
import type { DartClientFilters, DartNestedListModel } from './dart-board-contracts'
import { hasDartClientFilter } from './task-page-dart-list-model'
import { useDartNestedListModel } from './use-dart-nested-list-model'

/** D13.1 and D13.2: a search or any client filter, or the toggle off, renders flat as release A does. */
export function useDartSubtaskNesting(args: {
  boardPath: boolean
  relationshipsHost: boolean
  nestSubtasks: boolean
  search: string
  clientFilters: DartClientFilters
  tasks: readonly DartTask[]
  pageScope: DartReadScope
  hostKey: string
  accountKey: string
  publicationId?: number
}): { nested: boolean; model: DartNestedListModel } {
  const { boardPath, relationshipsHost, nestSubtasks, search, clientFilters, ...listArgs } = args
  const nested =
    boardPath &&
    relationshipsHost &&
    nestSubtasks &&
    search.trim() === '' &&
    !hasDartClientFilter(clientFilters)
  const model = useDartNestedListModel({ ...listArgs, nested, relationshipsHost })
  return { nested, model }
}
