import { aliasPrefixesFor, bumpDartEpochs } from './dart-task-identity'
import type { DartSlice, DartSliceSet } from './dart-slice-contract'

function isListKeyUnder(key: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => key.startsWith(`${prefix}::list::`))
}

export function createDartTaskPatchActions(
  set: DartSliceSet
): Pick<DartSlice, 'patchDartTask' | 'invalidateDartLists'> {
  return {
    patchDartTask: (identity, patch) => {
      const prefixes = aliasPrefixesFor(identity)
      // List items never carry a description; a stale copy on a row must not outlive the detail's.
      const { description: _description, ...rowPatch } = patch
      set((state) => {
        let changed = false
        const dartTaskCache = { ...state.dartTaskCache }
        for (const prefix of prefixes) {
          const key = `${prefix}::task::${identity.taskId}`
          const entry = dartTaskCache[key]
          if (entry?.data) {
            dartTaskCache[key] = { ...entry, data: { ...entry.data, ...patch }, fetchedAt: 0 }
            changed = true
          }
        }
        const dartListCache = { ...state.dartListCache }
        for (const [key, entry] of Object.entries(dartListCache)) {
          if (!entry?.data || !isListKeyUnder(key, prefixes)) {
            continue
          }
          const { tasks } = entry.data
          if (tasks.some((task) => task.id === identity.taskId)) {
            dartListCache[key] = {
              data: {
                ...entry.data,
                tasks: tasks.map((task) =>
                  task.id === identity.taskId ? { ...task, ...rowPatch } : task
                )
              },
              fetchedAt: 0
            }
            changed = true
          }
        }
        return changed ? { dartTaskCache, dartListCache } : state
      })
    },

    invalidateDartLists: (identity) => {
      bumpDartEpochs(identity)
      const prefixes = aliasPrefixesFor(identity)
      set((state) => {
        const stale = Object.entries(state.dartListCache).filter(
          ([key, entry]) => entry && entry.fetchedAt !== 0 && isListKeyUnder(key, prefixes)
        )
        if (stale.length === 0) {
          return state
        }
        return {
          dartListCache: {
            ...state.dartListCache,
            ...Object.fromEntries(stale.map(([key, entry]) => [key, { ...entry, fetchedAt: 0 }]))
          }
        }
      })
    }
  }
}
