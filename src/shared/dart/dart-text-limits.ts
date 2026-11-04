import { measureUtf8ByteLength } from '../utf8-byte-limits'

export const DART_TITLE_MAX_LENGTH = 500
export const DART_COMMENT_MAX_LENGTH = 50_000
export const DART_REQUEST_TEXT_MAX_BYTES = 256 * 1024

export type DartTextField = 'title' | 'comment' | 'description' | 'descriptionPatch'

export type DartRequestTextCheck =
  | { ok: true }
  | { ok: false; unit: 'characters' | 'bytes'; size: number; limit: number }

/** `descriptionPatch` takes every oldText, anchorText and newText of the request; the others take one text. */
export function checkDartRequestText(
  field: DartTextField,
  texts: string | readonly string[]
): DartRequestTextCheck {
  const list = typeof texts === 'string' ? [texts] : texts
  if (field === 'title' || field === 'comment') {
    const limit = field === 'title' ? DART_TITLE_MAX_LENGTH : DART_COMMENT_MAX_LENGTH
    const size = list.reduce((sum, text) => sum + text.length, 0)
    return size > limit ? { ok: false, unit: 'characters', size, limit } : { ok: true }
  }
  let size = 0
  for (const text of list) {
    size += measureUtf8ByteLength(text, {
      stopAfterBytes: DART_REQUEST_TEXT_MAX_BYTES - size
    }).byteLength
    if (size > DART_REQUEST_TEXT_MAX_BYTES) {
      return { ok: false, unit: 'bytes', size, limit: DART_REQUEST_TEXT_MAX_BYTES }
    }
  }
  return { ok: true }
}
