// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BrowserNewTabWorkspaceCard } from './browser-new-tab-workspace-card'
import type { WorkspaceLinkedItemRow } from '../../sidebar/workspace-hover-attachments'

afterEach(cleanup)

const dartRow: WorkspaceLinkedItemRow = {
  item: {
    provider: 'dart',
    type: 'issue',
    number: 0,
    dartIdentifier: 'aB3dE5gH7jK9',
    identifier: 'aB3dE5gH7jK9',
    title: 'Search results ignore archived projects',
    url: 'https://app.dartai.com/t/aB3dE5gH7jK9'
  },
  key: 'dart-row',
  url: 'https://app.dartai.com/t/aB3dE5gH7jK9',
  detail: undefined,
  live: null,
  liveTask: null
}

describe('new browser tab workspace card with a Dart link', () => {
  it('shows the Dart task id and title, not a #0 number or the GitHub issue icon', () => {
    const { container } = render(
      <BrowserNewTabWorkspaceCard
        servers={{ own: [], others: [] }}
        linkedItems={[dartRow]}
        runtimeTarget={null}
        openServersInPlace={false}
        onOpenUrl={() => {}}
      />
    )
    expect(container.textContent).toContain('aB3dE5gH7jK9')
    expect(container.textContent).toContain('Search results ignore archived projects')
    expect(container.textContent).not.toContain('#0')
    expect(container.querySelector('svg.lucide-circle-dot')).toBeNull()
  })
})
