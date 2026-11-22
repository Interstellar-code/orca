import { describe, expect, it } from 'vitest'
import { areWorkspaceLinkedItemsEqual, normalizeWorkspaceLinkedItem } from './workspace-linked-item'
import type { WorkspaceLinkedItem } from '../worktree/types'

describe('Dart linked items', () => {
  const dart: WorkspaceLinkedItem = {
    provider: 'dart',
    type: 'issue',
    number: 0,
    title: 'Ship Dart',
    url: 'https://app.dartai.com/t/aBcD3fGh1jKl-ship-dart',
    dartIdentifier: 'aBcD3fGh1jKl'
  }

  it('separates number-0 Dart links by identifier', () => {
    expect(areWorkspaceLinkedItemsEqual(dart, { ...dart, dartIdentifier: 'zYxW9vUt8sRq' })).toBe(
      false
    )
  })

  it('survives save and reload', () => {
    const reloaded = normalizeWorkspaceLinkedItem(JSON.parse(JSON.stringify(dart)))
    expect(reloaded).toEqual(dart)
    expect(areWorkspaceLinkedItemsEqual(reloaded, dart)).toBe(true)
  })
})
