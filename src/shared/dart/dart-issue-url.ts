import { DART_APP_HOST } from './dart-types'

export type ParsedDartTaskUrl = {
  taskId: string
  /** Slug-free task URL; one task keeps this identity when its title (and slug) changes. */
  canonicalUrl: string
}

export const DART_TASK_ID_PATTERN = /^[A-Za-z0-9]{12}$/

const DART_TASK_PATH_PATTERN = /^\/t\/([A-Za-z0-9]{12})(?:-[^/]*)?\/?$/

function parseTrustedDartUrl(value: string): URL | null {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return null
  }
  // API replies are untrusted: only https links on Dart's own host may be stored or opened.
  if (
    url.protocol !== 'https:' ||
    url.hostname.toLowerCase() !== DART_APP_HOST ||
    url.port.length > 0 ||
    url.username.length > 0 ||
    url.password.length > 0
  ) {
    return null
  }
  return url
}

export function isTrustedDartHtmlUrl(value: unknown): value is string {
  return typeof value === 'string' && parseTrustedDartUrl(value) !== null
}

/** Parses `https://app.dartai.com/t/<id>-<slug>` (slug optional); any other route returns null. */
export function parseDartTaskUrl(value: string): ParsedDartTaskUrl | null {
  const url = parseTrustedDartUrl(value)
  const match = url ? DART_TASK_PATH_PATTERN.exec(url.pathname) : null
  if (!match) {
    return null
  }
  return { taskId: match[1], canonicalUrl: buildDartTaskUrl(match[1]) }
}

export function buildDartTaskUrl(taskId: string): string {
  return `https://${DART_APP_HOST}/t/${encodeURIComponent(taskId)}`
}
