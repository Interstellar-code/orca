import type { DartLayout } from '../../../shared/dart/dart-saved-views'

export type DartViewMode = { layout: DartLayout; showEmptyColumns: boolean; nestSubtasks: boolean }

// Device-local, like the Jira view mode, rather than synced through ui.set.
const STORAGE_KEY = 'orca.dart.view-mode.v1'

const DEFAULT_MODE: DartViewMode = { layout: 'list', showEmptyColumns: false, nestSubtasks: true }

function parseDartViewMode(raw: string | null): DartViewMode {
  if (!raw) {
    return DEFAULT_MODE
  }
  const parsed: unknown = JSON.parse(raw)
  if (typeof parsed !== 'object' || parsed === null) {
    return DEFAULT_MODE
  }
  const stored = new Map(Object.entries(parsed))
  return {
    layout: stored.get('layout') === 'board' ? 'board' : DEFAULT_MODE.layout,
    showEmptyColumns: stored.get('showEmptyColumns') === true,
    nestSubtasks: stored.get('nestSubtasks') !== false
  }
}

export function loadDartViewMode(): DartViewMode {
  try {
    return parseDartViewMode(localStorage.getItem(STORAGE_KEY))
  } catch {
    return DEFAULT_MODE
  }
}

export function saveDartViewMode(mode: DartViewMode): void {
  try {
    // Storing only the non-defaults keeps a future default change from being pinned by old devices.
    const stored = {
      ...(mode.layout === DEFAULT_MODE.layout ? {} : { layout: mode.layout }),
      ...(mode.showEmptyColumns === DEFAULT_MODE.showEmptyColumns
        ? {}
        : { showEmptyColumns: true }),
      ...(mode.nestSubtasks === DEFAULT_MODE.nestSubtasks ? {} : { nestSubtasks: false })
    }
    if (Object.keys(stored).length === 0) {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
    }
  } catch {
    // The live view stays usable when browser storage is unavailable or full.
  }
}
