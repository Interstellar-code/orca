import { describe, expect, it } from 'vitest'
import { workspaceAttachmentReferenceLabel } from './workspace-attachments'

describe('Dart attachment reference label', () => {
  it('shows the Dart task id, not a #0 number label', () => {
    expect(
      workspaceAttachmentReferenceLabel({
        provider: 'dart',
        type: 'issue',
        number: 0,
        dartIdentifier: 'aBcD3fGh1jKl'
      })
    ).toBe('aBcD3fGh1jKl')
  })
})
