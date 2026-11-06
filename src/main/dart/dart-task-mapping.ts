import { isTrustedDartHtmlUrl } from '../../shared/dart/dart-issue-url'
import type { DartComment, DartTask, DartWorkspaceConfig } from '../../shared/dart/dart-types'

type RawRecord = Record<string, unknown>

function isRecord(value: unknown): value is RawRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function stringList(value: unknown): string[] {
  if (typeof value === 'string') {
    // Lane P saw `sizes` as one string; treat it as a comma list.
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  }
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((entry) => {
    if (typeof entry === 'string' || typeof entry === 'number') {
      return [String(entry)]
    }
    return isRecord(entry) && typeof entry.name === 'string' ? [entry.name] : []
  })
}

/** An empty `htmlUrl` is the `dart.invalidTaskUrl` signal: the untrusted link is dropped, the item kept. */
function trustedUrl(value: unknown): string {
  return isTrustedDartHtmlUrl(value) ? value : ''
}

export function mapDartTask(raw: unknown): DartTask | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.title !== 'string') {
    return null
  }
  const size = raw.size
  return {
    id: raw.id,
    title: raw.title,
    htmlUrl: trustedUrl(raw.htmlUrl),
    ...(typeof raw.description === 'string' ? { description: raw.description } : {}),
    parentId: optionalString(raw.parentId),
    dartboard: optionalString(raw.dartboard),
    type: optionalString(raw.type),
    status: optionalString(raw.status),
    assignee: optionalString(raw.assignee),
    tags: stringList(raw.tags),
    priority: optionalString(raw.priority),
    size: typeof size === 'string' || typeof size === 'number' ? size : null,
    startAt: optionalString(raw.startAt),
    dueAt: optionalString(raw.dueAt),
    createdBy: optionalString(raw.createdBy),
    updatedBy: optionalString(raw.updatedBy),
    ...(typeof raw.createdAt === 'string' ? { createdAt: raw.createdAt } : {}),
    ...(typeof raw.updatedAt === 'string' ? { updatedAt: raw.updatedAt } : {}),
    completedAt: optionalString(raw.completedAt)
  }
}

export function mapDartComment(raw: unknown): DartComment | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.taskId !== 'string') {
    return null
  }
  return {
    id: raw.id,
    parentId: optionalString(raw.parentId),
    taskId: raw.taskId,
    htmlUrl: trustedUrl(raw.htmlUrl),
    author: optionalString(raw.author) ?? '',
    text: optionalString(raw.text) ?? '',
    ...(typeof raw.createdAt === 'string' ? { createdAt: raw.createdAt } : {})
  }
}

export function mapDartConfig(raw: unknown): DartWorkspaceConfig {
  const config = isRecord(raw) ? raw : {}
  return {
    dartboards: stringList(config.dartboards),
    statuses: stringList(config.statuses),
    types: stringList(config.types),
    tags: stringList(config.tags),
    priorities: stringList(config.priorities),
    sizes: stringList(config.sizes),
    assignees: stringList(config.assignees)
  }
}

/** `{count, results}` list pages; comments require both fields for safe pagination. */
export function readDartPage(raw: unknown, strict = false): { results: unknown[]; count: number } {
  const page = isRecord(raw) ? raw : {}
  const count =
    typeof page.count === 'number' && Number.isSafeInteger(page.count) && page.count >= 0
      ? page.count
      : undefined
  if (strict && (!Array.isArray(page.results) || count === undefined)) {
    throw new Error('Dart returned an unreadable comment page.')
  }
  const results = Array.isArray(page.results) ? page.results : []
  return { results, count: count ?? results.length }
}

/** `GET /tasks/{id}` and writes wrap the task as `{item}`. */
export function unwrapDartItem(raw: unknown): unknown {
  return isRecord(raw) && 'item' in raw ? raw.item : raw
}
