import { describe, expect, it } from 'vitest'
import { matchesSettingsSearch } from './settings-search'
import { getTasksPaneSearchEntries } from './tasks-search'

describe('Task Sources settings search', () => {
  it.each(['dart', 'jira', 'linear'])('finds Task Sources when searching for %s', (query) => {
    expect(matchesSettingsSearch(query, getTasksPaneSearchEntries())).toBe(true)
  })

  it('does not match an unrelated provider name', () => {
    expect(matchesSettingsSearch('trello', getTasksPaneSearchEntries())).toBe(false)
  })
})
