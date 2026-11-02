import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TaskPageSourceBar } from './SourceBar'
import type { TaskPageComposerActionsModel } from './use-task-page-composer-actions'

function renderSourceBar(overrides: Record<string, unknown>): string {
  const model = {
    taskSource: 'dart',
    dartConnected: true,
    dartStatus: { connected: true, viewer: { id: 'u-1', name: 'Alex Doe' } },
    visibleSourceOptions: [],
    taskSourceAvailabilityNoticeByProvider: {},
    taskSourceContextSummary: { label: 'Dart', title: 'Dart' },
    githubMode: 'items',
    taskSourceManuallyChangedRef: { current: false },
    ...overrides
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the Dart branch reads only the fields set above.
  const sourceBarModel = model as unknown as TaskPageComposerActionsModel
  return renderToStaticMarkup(
    <TooltipProvider>
      <TaskPageSourceBar model={sourceBarModel} />
    </TooltipProvider>
  )
}

describe('Tasks page source bar for Dart', () => {
  it('shows who Dart is signed in as and a link out to Dart', () => {
    const html = renderSourceBar({})
    expect(html).toContain('Dart · signed in as Alex Doe')
    expect(html).toContain('Open Dart in the browser')
  })

  it('shows neither Dart control when Dart is not connected', () => {
    const html = renderSourceBar({ dartConnected: false })
    expect(html).not.toContain('signed in as')
    expect(html).not.toContain('Open Dart in the browser')
  })

  it('shows no Dart controls on another provider tab', () => {
    expect(renderSourceBar({ taskSource: 'github' })).not.toContain('Open Dart in the browser')
  })
})
