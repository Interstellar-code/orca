// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DartTask } from '../../../../shared/dart/dart-types'
import type { WorkspaceAttachment } from '../../../../shared/worktree/types'
import { normalizeTaskSourceContext } from '../../../../shared/task-source-context'
import { readWorkspaceReferenceDetails } from './workspace-reference-detail-read'
import { getWorkspaceReferenceRequest } from './workspace-reference-details'
import { referenceRepo, referenceWorkspace } from './workspace-reference-fixtures.test-support'

const fetchDartTask = vi.hoisted(() => vi.fn())
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({ dartTaskCache: {}, fetchDartTask, settings: {} })
  }
}))

const taskId = 'aB3dE5gH7jK9'
const task: DartTask = {
  id: taskId,
  title: 'Search results ignore archived projects',
  htmlUrl: `https://app.dartai.com/t/${taskId}-search`,
  status: 'Doing',
  tags: []
}
const dartLink: WorkspaceAttachment = {
  provider: 'dart',
  type: 'issue',
  number: 0,
  identifier: taskId,
  dartIdentifier: taskId,
  url: `https://app.dartai.com/t/${taskId}`
}

beforeEach(() => vi.clearAllMocks())

describe('reading a Dart workspace attachment', () => {
  it('reads the task through the workspace host and reports title, link and status', async () => {
    fetchDartTask.mockResolvedValue({ ok: true, task })
    const request = getWorkspaceReferenceRequest(dartLink, referenceWorkspace, referenceRepo)
    expect(request.sourceContext?.provider).toBe('dart')
    const detail = await readWorkspaceReferenceDetails(request)
    expect(detail).toEqual({ title: task.title, url: task.htmlUrl, stateName: 'Doing' })
    expect(fetchDartTask).toHaveBeenCalledWith(taskId, { sourceContext: request.sourceContext })
  })

  it('uses the source context stored on the link over the repository host', async () => {
    fetchDartTask.mockResolvedValue({ ok: true, task })
    const stored = normalizeTaskSourceContext({
      provider: 'dart',
      projectId: 'project',
      hostId: 'runtime:owner'
    })
    const request = getWorkspaceReferenceRequest(
      { ...dartLink, taskSourceContext: stored ?? undefined },
      referenceWorkspace,
      referenceRepo
    )
    await readWorkspaceReferenceDetails(request)
    expect(fetchDartTask).toHaveBeenCalledWith(taskId, {
      sourceContext: expect.objectContaining({ provider: 'dart', hostId: 'runtime:owner' })
    })
  })

  it('rebuilds the canonical link when the client blanked an untrusted one', async () => {
    fetchDartTask.mockResolvedValue({ ok: true, task: { ...task, htmlUrl: '' } })
    const detail = await readWorkspaceReferenceDetails(
      getWorkspaceReferenceRequest(dartLink, referenceWorkspace, referenceRepo)
    )
    expect(detail?.url).toBe(`https://app.dartai.com/t/${taskId}`)
  })

  it('reports no details when the task cannot be read', async () => {
    fetchDartTask.mockResolvedValue({ ok: false, error: 'x', errorCode: 'dart.taskNotFound' })
    expect(
      await readWorkspaceReferenceDetails(
        getWorkspaceReferenceRequest(dartLink, referenceWorkspace, referenceRepo)
      )
    ).toBeNull()
  })
})
