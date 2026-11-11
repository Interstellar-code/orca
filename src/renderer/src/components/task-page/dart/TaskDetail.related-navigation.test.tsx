// @vitest-environment happy-dom

import { useEffect } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dartTaskFixture } from '@/store/slices/dart/dart-fake-runtime.test-support'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import { TaskPageDartTaskDetail } from './TaskDetail'

const wiring = vi.hoisted(
  (): {
    runCloseGuards: () => Promise<boolean>
    openRelated: null | ((related: unknown) => void)
  } => ({
    runCloseGuards: () => Promise.resolve(true),
    openRelated: null
  })
)

vi.mock('./use-dart-task-detail-data', () => ({
  useDartTaskDetailData: (task: unknown) => ({
    task,
    runCloseGuards: () => wiring.runCloseGuards(),
    commentDraftKey: 'comments',
    descriptionDraftKey: 'description'
  })
}))
vi.mock('./use-dart-task-relationships', () => ({ useDartTaskRelationships: () => undefined }))
vi.mock('./TaskDetailView', () => ({
  DartTaskDetailView: ({
    onOpenRelatedTask
  }: {
    onOpenRelatedTask: (related: unknown) => void
  }) => {
    useEffect(() => {
      wiring.openRelated = onOpenRelatedTask
    })
    return null
  }
}))

const sourceContext: TaskSourceContext = {
  kind: 'task-source',
  provider: 'dart',
  projectId: 'project-1',
  hostId: 'runtime:env',
  providerIdentity: { provider: 'dart', userId: 'user-a' }
}
const current = dartTaskFixture('currentTask01')
const related = dartTaskFixture('relatedTask01')

function renderDetail(onOpenTask = vi.fn()) {
  render(
    <TaskPageDartTaskDetail
      task={current}
      sourceContext={sourceContext}
      providerRuntimeContextKey="page"
      workspaces={[]}
      onUse={vi.fn()}
      onClose={vi.fn()}
      onOpenWorkspace={vi.fn()}
      onOpenTask={onOpenTask}
    />
  )
  return onOpenTask
}

afterEach(() => {
  cleanup()
  wiring.runCloseGuards = () => Promise.resolve(true)
  wiring.openRelated = null
})

describe('related task navigation', () => {
  it('opens the related task with the source context once the close guards allow it', async () => {
    const onOpenTask = renderDetail()

    await act(async () => wiring.openRelated?.(related))

    expect(onOpenTask).toHaveBeenCalledExactlyOnceWith(related, sourceContext)
  })

  it('stays on the task when a close guard refuses or throws', async () => {
    const onOpenTask = renderDetail()

    wiring.runCloseGuards = () => Promise.resolve(false)
    await act(async () => wiring.openRelated?.(related))
    wiring.runCloseGuards = () => Promise.reject(new Error('guard failed'))
    await act(async () => wiring.openRelated?.(related))

    expect(onOpenTask).not.toHaveBeenCalled()
  })

  it('ignores a second navigation while the first guard is pending', async () => {
    let release: (allowed: boolean) => void = () => {}
    const run = vi.fn(() => new Promise<boolean>((resolve) => (release = resolve)))
    wiring.runCloseGuards = run
    const onOpenTask = renderDetail()

    await act(async () => {
      wiring.openRelated?.(related)
      wiring.openRelated?.(dartTaskFixture('relatedTask02'))
    })
    expect(run).toHaveBeenCalledTimes(1)
    await act(async () => release(true))

    expect(onOpenTask).toHaveBeenCalledExactlyOnceWith(related, sourceContext)
  })
})
