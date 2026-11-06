import { DART_API_BASE_URL } from '../../shared/dart/dart-types'
import {
  readFetchResponseJsonWithinLimit,
  readFetchResponseTextWithinLimit
} from '../../shared/fetch-response-body'
import { getMainHttpClient } from '../network/http-client'
import { ensureElectronProxyFromEnvironment } from '../network/proxy-settings'
import { withSpan } from '../observability/tracer'

export const DART_REQUEST_TIMEOUT_MS = 30_000
const DART_RESPONSE_MAX_BYTES = 8 * 1024 * 1024
const DART_ERROR_BODY_MAX_BYTES = 64 * 1024
const DART_ERROR_DETAIL_MAX_CHARS = 300
const DESCRIPTION_PATCH_PATH_SUFFIX = '/update-description'

export type DartRequestFailureKind = 'http' | 'network' | 'timeout' | 'invalidResponse'

/** Carries status, a short server detail and a 429's wait only; headers (the token) never enter it. */
export class DartApiError extends Error {
  constructor(
    message: string,
    readonly kind: DartRequestFailureKind,
    readonly status: number | null = null,
    /** A 429's Retry-After, untrusted: callers format it and nothing retries on it. */
    readonly retryAfter: string | null = null
  ) {
    super(message)
    this.name = 'DartApiError'
  }
}

export type DartQueryValue = string | number | boolean | undefined

export type DartRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT'
  query?: Record<string, DartQueryValue>
  body?: unknown
  timeoutMs?: number
}

function buildUrl(path: string, query: DartRequestOptions['query']): string {
  const url = new URL(`${DART_API_BASE_URL}${path}`)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value]
  }
  if (Array.isArray(value)) {
    return value.flatMap(stringsIn)
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, entry]) =>
      stringsIn(entry).map((text) => (Array.isArray(value) ? text : `${key}: ${text}`))
    )
  }
  return []
}

// Dart error bodies are `{detail}`, `{errors: [...]}`, a bare `[string]`, field errors, or HTML.
async function readErrorDetail(response: Response): Promise<string> {
  let text: string
  try {
    text = await readFetchResponseTextWithinLimit(response, DART_ERROR_BODY_MAX_BYTES)
  } catch {
    return ''
  }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return ''
  }
  const detail =
    data && typeof data === 'object' && !Array.isArray(data) && 'detail' in data
      ? stringsIn(data.detail)
      : data && typeof data === 'object' && !Array.isArray(data) && 'errors' in data
        ? stringsIn(data.errors)
        : stringsIn(data)
  return detail.join('; ').slice(0, DART_ERROR_DETAIL_MAX_CHARS)
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
}

/** One Dart call: bounded by a deadline, body fully consumed, and its transport signal retired after. */
export async function dartRequest<T>(
  token: string,
  path: string,
  options: DartRequestOptions = {}
): Promise<T> {
  const url = buildUrl(path, options.query)
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, options.timeoutMs ?? DART_REQUEST_TIMEOUT_MS)
  try {
    return await withSpan(
      'dart.request',
      async (span) => {
        // Path only: the query can carry user search text.
        span.setAttribute('dart.path', path)
        const httpClient = getMainHttpClient()
        const proxySession = httpClient.proxySession()
        await ensureElectronProxyFromEnvironment({
          ...(proxySession ? { proxySession } : {}),
          probeUrl: url
        }).catch((error: unknown) => {
          span.addEvent('dart.proxySetupFailed', {
            errorName: error instanceof Error ? error.name : typeof error
          })
        })
        const headers = new Headers({
          Accept: 'application/json',
          Authorization: `Bearer ${token}`
        })
        if (options.body !== undefined) {
          headers.set('Content-Type', 'application/json')
        }
        let response: Response
        try {
          response = await httpClient.fetch(url, {
            method: options.method ?? 'GET',
            headers,
            signal: controller.signal,
            // A redirect would replay the bearer token to wherever it points.
            redirect: 'error',
            // JSON drops undefined fields, so omitted updates stay omitted.
            ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
          })
        } catch (error) {
          span.setAttribute(
            'dart.transportErrorName',
            error instanceof Error ? error.name : typeof error
          )
          throw timedOut || isAbortError(error)
            ? new DartApiError('Dart did not respond in time.', 'timeout')
            : new DartApiError('Could not reach Dart.', 'network')
        }
        span.setAttribute('dart.status', response.status)
        if (!response.ok) {
          // Dart may echo the patched task text in this body.
          const detail = path.endsWith(DESCRIPTION_PATCH_PATH_SUFFIX)
            ? ''
            : await readErrorDetail(response)
          const summary = `Dart request failed (HTTP ${response.status})`
          throw new DartApiError(
            detail ? `${summary}: ${detail}` : `${summary}.`,
            'http',
            response.status,
            response.status === 429 ? response.headers.get('retry-after') : null
          )
        }
        try {
          return await readFetchResponseJsonWithinLimit<T>(response, DART_RESPONSE_MAX_BYTES)
        } catch (error) {
          throw timedOut
            ? new DartApiError('Dart did not respond in time.', 'timeout')
            : isAbortError(error)
              ? new DartApiError('Could not reach Dart.', 'network')
              : new DartApiError('Dart returned an unreadable response.', 'invalidResponse')
        }
      },
      { kind: 'client' }
    )
  } finally {
    clearTimeout(timer)
    // Cancelling the body alone can leave Chromium's native request open.
    controller.abort()
  }
}
