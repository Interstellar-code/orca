import type { DartTaskPage } from '../../../../../shared/dart/dart-types'
import type {
  DartScopeMeta,
  DartScopeReadResult,
  DartServerFilters
} from '@/components/task-page/dart/dart-board-contracts'
import { withPendingDartPatches } from '@/components/task-page/dart/dart-task-write-state'
import { buildDartListArgs } from '@/components/task-page/dart/task-page-dart-list-model'
import { translate } from '@/i18n/i18n'
import {
  dartListTasksForTarget,
  type DartClientFailure,
  type DartClientResult
} from '@/runtime/runtime-dart-client'
import type { CacheEntry } from '../../github/cache-model'
import { runDartRead, type InflightDartRead } from './dart-read-actions'
import {
  evictDartListCache,
  getDartReadScope,
  isFreshDartCacheEntry,
  scopedDartCacheKey,
  type DartReadScope
} from './dart-read-coordination'
import {
  DART_DONE_PAGE_SIZE,
  dartScopeFailure,
  mergeDartScopeTasks,
  missingRowCountsFailure,
  readDartScopePages,
  type DartScopePageArgs
} from './dart-scope-paging'
import {
  dartAccountIdentity,
  dartScopeViewerId,
  registerDartCacheAlias
} from './dart-task-identity'
import type { DartSlice, DartSliceGet, DartSliceSet } from './dart-slice-contract'

type DartScopeReadActions = Pick<
  DartSlice,
  'readDartScope' | 'publishDartScope' | 'readMoreDone' | 'mountDartScope'
>

const inflightScopeReads = new Map<string, InflightDartRead<DartTaskPage>>()
let scopeReadSequence = 0
// Bumped when a read set starts, so a "Show 50 more" reply from before it is dropped.
let scopeReadSetToken = 0

// Fixed key order, so a full filter object and its three server fields name the same entry.
export function dartScopeCacheKey(scope: DartReadScope, filters: DartServerFilters): string {
  const { mine, dartboard, search } = filters
  return scopedDartCacheKey(scope, `list::scope::${JSON.stringify({ mine, dartboard, search })}`)
}

const EMPTY_SCOPE_READ: DartScopeReadResult = {
  tasks: [],
  openTotal: 0,
  doneTotal: 0,
  doneOffset: 0,
  incomplete: false,
  failure: null
}

function boardUpdateRequiredFailure(): DartClientFailure {
  return {
    ok: false,
    error: translate(
      'auto.store.slices.dart.dart-scope-read-actions.boardUpdateRequired',
      'Update the remote Orca server to use the board'
    )
  }
}

function metaForEntry(entry: CacheEntry<DartTaskPage> | undefined): DartScopeMeta {
  return {
    openTotal: entry?.data?.totalCount ?? 0,
    doneTotal: 0,
    doneOffset: 0,
    generation: 0,
    fetchedAt: entry?.fetchedAt ?? 0,
    incomplete: false,
    partialReason: null
  }
}

export function createDartScopeReadActions(
  set: DartSliceSet,
  get: DartSliceGet
): DartScopeReadActions {
  return {
    readDartScope: async (serverFilters, { features }) => {
      scopeReadSetToken += 1
      const scope = getDartReadScope(get().settings)
      registerDartCacheAlias(scope, dartScopeViewerId(get(), scope))
      const base = buildDartListArgs(
        { ...serverFilters, status: null },
        get().dartStatus.viewer?.id
      )
      if (!base) {
        return EMPTY_SCOPE_READ
      }
      if (!features.board) {
        return {
          ...EMPTY_SCOPE_READ,
          incomplete: true,
          failure: dartScopeFailure(boardUpdateRequiredFailure())
        }
      }
      return readDartScopePages(base, (args) => readScopePage(set, get, scope, args))
    },

    publishDartScope: (serverFilters, { result, current }) => {
      const scope = getDartReadScope(get().settings)
      const viewerId = dartScopeViewerId(get(), scope)
      registerDartCacheAlias(scope, viewerId)
      const key = dartScopeCacheKey(scope, serverFilters)
      const account = dartAccountIdentity(scope, viewerId)
      const now = Date.now()
      set((state) => {
        const entry = state.dartListCache[key]
        const previous = state.dartScopeMetaCache[key] ?? metaForEntry(entry)
        const failure = result.failure
        // A read set a write overtook never publishes rows, failed or not.
        const partialReason = current ? (failure?.reason ?? null) : 'changed'
        const completeRead = current && failure === null
        const partialFirstRead = current && failure !== null && !entry
        let listCache = state.dartListCache
        let meta: DartScopeMeta
        if (completeRead || partialFirstRead) {
          const tasks = withPendingDartPatches(result.tasks, account)
          const fetchedAt = completeRead ? now : 0
          listCache = {
            ...listCache,
            [key]: { data: { tasks, totalCount: result.openTotal }, fetchedAt }
          }
          meta = {
            openTotal: result.openTotal,
            doneTotal: result.doneTotal,
            doneOffset: result.doneOffset,
            generation: previous.generation + 1,
            fetchedAt,
            incomplete: result.incomplete,
            partialReason
          }
        } else {
          meta = { ...previous, partialReason }
        }
        return {
          dartMountedScopeKey: key,
          ...evictDartListCache(
            {
              dartMountedScopeKey: key,
              dartScopeMetaCache: { ...state.dartScopeMetaCache, [key]: meta }
            },
            listCache
          )
        }
      })
    },

    mountDartScope: (serverFilters) => {
      const key = dartScopeCacheKey(getDartReadScope(get().settings), serverFilters)
      const state = get()
      if (!isFreshDartCacheEntry(state.dartListCache[key]) || !state.dartScopeMetaCache[key]) {
        return false
      }
      if (state.dartMountedScopeKey !== key) {
        set({ dartMountedScopeKey: key })
      }
      return true
    },

    readMoreDone: async (serverFilters, { features }) => {
      const scope = getDartReadScope(get().settings)
      const key = dartScopeCacheKey(scope, serverFilters)
      const started = get()
      const startMeta = started.dartScopeMetaCache[key]
      const base = buildDartListArgs(
        { ...serverFilters, status: null },
        started.dartStatus.viewer?.id
      )
      if (!base || !startMeta || !started.dartListCache[key]?.data) {
        return { ok: true }
      }
      if (!features.board) {
        return boardUpdateRequiredFailure()
      }
      const startToken = scopeReadSetToken
      const page = await readScopePage(set, get, scope, {
        ...base,
        isCompleted: true,
        order: '-completed_at',
        limit: DART_DONE_PAGE_SIZE,
        offset: startMeta.doneOffset
      })
      if (!page.ok) {
        return page
      }
      if (!page.raw) {
        return missingRowCountsFailure()
      }
      const { raw } = page
      const rows = withPendingDartPatches(
        page.tasks,
        dartAccountIdentity(scope, dartScopeViewerId(get(), scope))
      )
      // A refresh, filter change or twin read moved the scope on; this page no longer belongs to it.
      set((state) => {
        const entry = state.dartListCache[key]
        const meta = state.dartScopeMetaCache[key]
        if (
          startToken !== scopeReadSetToken ||
          !entry?.data ||
          !meta ||
          state.dartMountedScopeKey !== key ||
          meta.generation !== startMeta.generation ||
          meta.doneOffset !== startMeta.doneOffset
        ) {
          return state
        }
        return {
          dartListCache: {
            ...state.dartListCache,
            [key]: {
              ...entry,
              data: {
                ...entry.data,
                tasks: mergeDartScopeTasks(entry.data.tasks, rows).tasks
              }
            }
          },
          dartScopeMetaCache: {
            ...state.dartScopeMetaCache,
            [key]: {
              ...meta,
              doneTotal: raw.totalCount,
              doneOffset: meta.doneOffset + raw.rowCount
            }
          }
        }
      })
      return { ok: true }
    }
  }
}

// Never cached or shared: a refresh must see Dart's rows as of now, and `store` has nothing to write.
function readScopePage(
  set: DartSliceSet,
  get: DartSliceGet,
  scope: DartReadScope,
  args: DartScopePageArgs
): Promise<DartClientResult<DartTaskPage>> {
  scopeReadSequence += 1
  return runDartRead({
    set,
    get,
    scope,
    inflightReads: inflightScopeReads,
    flightKey: `${scope.contextKey}::scope::${scopeReadSequence}`,
    force: true,
    read: () => dartListTasksForTarget(scope.target, args),
    store: () => {}
  })
}
