import { afterEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n/i18n'
import { taskProviderErrorText } from './task-provider-error-copy'

const originalLanguage = i18n.language

afterEach(async () => {
  await i18n.changeLanguage(originalLanguage)
})

describe('task provider error copy', () => {
  it('shows only a validated Dart rate-limit wait, not arbitrary host detail', async () => {
    await i18n.changeLanguage('en')
    expect(
      taskProviderErrorText(
        'Dart request failed (HTTP 429). Retry after 30 seconds.',
        'dart.rateLimited'
      )
    ).toContain('Retry after 30 seconds.')
    expect(
      taskProviderErrorText(
        'Dart request failed (HTTP 429). Retry after 2026-11-02T12:00:00.000Z.',
        'dart.rateLimited'
      )
    ).toContain('Retry after 2026-11-02T12:00:00.000Z.')
    expect(taskProviderErrorText('secret Retry after <script>.', 'dart.rateLimited')).not.toContain(
      'secret'
    )
  })
})
