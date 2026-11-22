import { describe, expect, it } from 'vitest'
import { getTaskSourceContextSummary } from './task-source-context-summary'

describe('getTaskSourceContextSummary for Dart', () => {
  const hostLabelById = new Map([['local', 'Ubu 7of9']])

  it('names the signed-in Dart account', () => {
    const summary = getTaskSourceContextSummary({
      provider: 'dart',
      providerLabel: 'Dart',
      accountHostId: 'local',
      hostLabelById,
      dartAccountName: 'Rohit Sharma'
    })
    expect(summary.label).toBe('Dart · Ubu 7of9 · Rohit Sharma')
  })

  it('falls back to Current account without a known viewer', () => {
    const summary = getTaskSourceContextSummary({
      provider: 'dart',
      providerLabel: 'Dart',
      accountHostId: 'local',
      hostLabelById,
      dartAccountName: null
    })
    expect(summary.label).toBe('Dart · Ubu 7of9 · Current account')
  })
})
