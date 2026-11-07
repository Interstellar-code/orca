import { z } from 'zod'
import {
  MAX_DART_SAVED_VIEW_ID_LENGTH,
  MAX_DART_SAVED_VIEW_NAME_LENGTH
} from '../dart/dart-saved-views'
import { DART_TITLE_MAX_LENGTH } from '../dart/dart-text-limits'

const ViewId = z.string().trim().min(1).max(MAX_DART_SAVED_VIEW_ID_LENGTH)
const ViewName = z.string().trim().min(1).max(MAX_DART_SAVED_VIEW_NAME_LENGTH)
const FilterText = z.string().trim().max(DART_TITLE_MAX_LENGTH).nullable()

export const DartBoardFiltersParam = z.object({
  mine: z.boolean(),
  status: FilterText,
  dartboard: FilterText,
  search: z.string().max(DART_TITLE_MAX_LENGTH),
  tag: FilterText,
  priority: FilterText,
  onHold: z.boolean()
})

export const DartSavedViewParam = z.object({
  id: ViewId,
  name: ViewName,
  filters: DartBoardFiltersParam,
  layout: z.enum(['list', 'board']),
  showEmptyColumns: z.boolean()
})

export const DartSavedViewMutationParam = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('save'), view: DartSavedViewParam }),
  z.object({ kind: z.literal('rename'), id: ViewId, name: ViewName }),
  z.object({ kind: z.literal('delete'), id: ViewId }),
  z.object({ kind: z.literal('select'), id: ViewId.nullable() })
])
