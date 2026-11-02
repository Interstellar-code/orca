import { afterEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n/i18n'
import es from '@/i18n/locales/es.json'
import { taskProviderErrorMessage, taskProviderErrorText } from './task-provider-error-copy'

const originalLanguage = i18n.language

afterEach(async () => {
  await i18n.changeLanguage(originalLanguage)
})

describe('task provider error copy', () => {
  it('recognizes old hosts and Electron wrappers without rewriting provider errors', async () => {
    i18n.addResourceBundle('es', 'translation', es)
    await i18n.changeLanguage('es')
    expect(taskProviderErrorMessage({ error: 'Not connected to Jira.' })).toBe(
      es.taskProviders.errors.jira.notConnected
    )
    expect(
      taskProviderErrorText(
        "Error invoking remote method 'linear:listProjects': Error: Project ID is required"
      )
    ).toBe(es.taskProviders.errors.linear.projectIdRequired)
    const external =
      "Error invoking remote method 'jira:createIssue': Error: custom field is invalid"
    expect(taskProviderErrorText(external)).toBe(external)
    expect(taskProviderErrorMessage({ errorCode: 'future.code', error: 'New host failure' })).toBe(
      'New host failure'
    )
  })

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
