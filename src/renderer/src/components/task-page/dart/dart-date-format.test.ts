import { describe, expect, it } from 'vitest'
import { dartCalendarDate, formatDartDate, isFinishedDateInput } from './dart-date-format'

describe('dart date format', () => {
  it('keeps a date-only value as written', () => {
    expect(dartCalendarDate('2026-11-04')).toBe('2026-11-04')
    expect(formatDartDate('2026-11-04', 'en-US')).toBe('11/4/2026')
  })

  it('takes the written calendar date of a datetime, whatever its offset', () => {
    expect(dartCalendarDate('2026-11-04T00:00:00.000Z')).toBe('2026-11-04')
    expect(dartCalendarDate('2026-11-04T01:30:00+09:00')).toBe('2026-11-04')
    expect(formatDartDate('2026-11-04T23:30:00-05:00', 'en-US')).toBe('11/4/2026')
  })

  it('shows the same day in a negative-offset zone', () => {
    const zone = process.env.TZ
    process.env.TZ = 'America/Los_Angeles'
    try {
      expect(formatDartDate('2026-11-04', 'en-US')).toBe('11/4/2026')
      expect(formatDartDate('2026-11-04T00:00:00Z', 'en-US')).toBe('11/4/2026')
    } finally {
      process.env.TZ = zone
    }
  })

  it('rejects text that is not a real date', () => {
    expect(dartCalendarDate('2026-02-31')).toBeNull()
    expect(dartCalendarDate('soon')).toBeNull()
    expect(dartCalendarDate(null)).toBeNull()
    expect(formatDartDate('')).toBeNull()
  })

  it('waits for a four-digit year before a typed date counts', () => {
    expect(isFinishedDateInput('0002-11-04')).toBe(false)
    expect(isFinishedDateInput('2026-11-04')).toBe(true)
    expect(isFinishedDateInput('')).toBe(false)
  })
})
