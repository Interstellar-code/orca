import { describe, expect, it } from 'vitest'
import {
  DART_COMMENT_MAX_LENGTH,
  DART_REQUEST_TEXT_MAX_BYTES,
  DART_TITLE_MAX_LENGTH,
  checkDartRequestText
} from './dart-text-limits'

describe('checkDartRequestText', () => {
  it('counts title and comment in characters, accepting the limit and refusing one over', () => {
    expect(checkDartRequestText('title', 'x'.repeat(DART_TITLE_MAX_LENGTH))).toEqual({ ok: true })
    expect(checkDartRequestText('title', 'x'.repeat(DART_TITLE_MAX_LENGTH + 1))).toMatchObject({
      ok: false,
      unit: 'characters'
    })
    expect(checkDartRequestText('comment', 'x'.repeat(DART_COMMENT_MAX_LENGTH))).toEqual({
      ok: true
    })
    expect(checkDartRequestText('comment', 'x'.repeat(DART_COMMENT_MAX_LENGTH + 1))).toMatchObject({
      ok: false
    })
  })

  it('counts a description in UTF-8 bytes, not characters', () => {
    const chars = DART_REQUEST_TEXT_MAX_BYTES / 2
    expect(checkDartRequestText('description', 'é'.repeat(chars))).toEqual({ ok: true })
    expect(checkDartRequestText('description', 'é'.repeat(chars + 1))).toMatchObject({
      ok: false,
      unit: 'bytes',
      limit: DART_REQUEST_TEXT_MAX_BYTES
    })
  })

  it('sums every text of a description patch', () => {
    const half = 'x'.repeat(DART_REQUEST_TEXT_MAX_BYTES / 2)
    expect(checkDartRequestText('descriptionPatch', [half, half])).toEqual({ ok: true })
    expect(checkDartRequestText('descriptionPatch', [half, half, 'x'])).toMatchObject({
      ok: false
    })
  })
})
