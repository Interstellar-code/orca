// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { WorktreeReferenceStack } from './WorktreeReferenceStack'

afterEach(cleanup)

describe('Dart link in the fixed workspace reference stack', () => {
  it('labels a Dart link with its task id, not as a numbered GitHub issue', () => {
    const { container } = render(
      <WorktreeReferenceStack
        items={[{ provider: 'dart', type: 'issue', number: 0, dartIdentifier: 'aBcD3fGh1jKl' }]}
        details={{}}
      />
    )
    expect(container.innerHTML).toContain('Linked Dart aBcD3fGh1jKl')
    expect(container.innerHTML).not.toContain('Linked issue #0')
  })
})
