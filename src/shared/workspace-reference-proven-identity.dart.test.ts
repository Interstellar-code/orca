import { describe, expect, it } from 'vitest'
import {
  getProvenWorkspaceReferenceIdentity,
  getWorkspaceReferenceIdentity,
  parseWorkspaceReferenceUrl
} from './workspace-reference-identity'
import type { WorkspaceAttachment } from './worktree/types'

const taskId = 'aBcD3fGh1jKl'

const dartAttachment = (overrides: Partial<WorkspaceAttachment>): WorkspaceAttachment => ({
  provider: 'dart',
  type: 'issue',
  number: 0,
  title: 'Ship Dart',
  dartIdentifier: taskId,
  ...overrides
})

describe('proven identity of a Dart attachment', () => {
  const pasted = getWorkspaceReferenceIdentity(
    parseWorkspaceReferenceUrl(`https://app.dartai.com/t/${taskId}-ship-dart`)
  )

  it('matches the pasted link when the stored link has a different slug', () => {
    expect(
      getProvenWorkspaceReferenceIdentity(
        dartAttachment({ url: `https://app.dartai.com/t/${taskId}-renamed` })
      )
    ).toBe(pasted)
  })

  it('rebuilds the link from the task id when only the Dart source context is stored', () => {
    expect(
      getProvenWorkspaceReferenceIdentity(
        dartAttachment({
          taskSourceContext: {
            kind: 'task-source',
            provider: 'dart',
            projectId: 'project-1',
            hostId: 'local',
            providerIdentity: { provider: 'dart', userId: 'u-1' }
          }
        })
      )
    ).toBe(pasted)
  })

  it('does not prove an identity from a task id whose case differs from the link', () => {
    expect(
      getProvenWorkspaceReferenceIdentity(
        dartAttachment({
          dartIdentifier: taskId.toLowerCase(),
          url: `https://app.dartai.com/t/${taskId}`
        })
      )
    ).toBeUndefined()
  })
})
