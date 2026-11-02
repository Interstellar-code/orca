import { describe, expect, it, vi } from 'vitest'
import type { PersistedState } from '../../shared/persisted-state-types'
import type { ProjectGroup } from '../../shared/project-group-types'
import type { TaskSourceContext } from '../../shared/task-source-context'
import type { WorkspaceAttachment, WorkspaceLinkedItem } from '../../shared/worktree/types'
import type { WorktreeMeta } from '../../shared/worktree/meta-types'
import { getWorkspaceAttachments } from '../../shared/workspace-attachments'
import { normalizeFolderWorkspaces } from '../../shared/folder-workspaces'
import { mergeWorktreeMetaForWrite } from './loading-store/worktree-meta-write-normalization'
import { normalizeWorktreeLinkedItemMetadata } from './tracking-repos/worktree-metadata-normalization'
import { FolderWorkspacePersistenceOperations } from './restoring-sessions/folder-workspace-operations'

vi.mock('../../shared/sidebar-inputs-switch', () => ({ ORCA_SIDEBAR_INPUTS_IS_MAIN: true }))

const taskId = 'aB3dE5gH7jK9'
const context: TaskSourceContext = {
  kind: 'task-source',
  provider: 'dart',
  projectId: 'project-1',
  hostId: 'runtime:env-1'
}
const dartLink: WorkspaceAttachment = {
  provider: 'dart',
  type: 'issue',
  number: 0,
  identifier: taskId,
  dartIdentifier: taskId,
  title: 'Search results ignore archived projects',
  url: `https://app.dartai.com/t/${taskId}`,
  taskSourceContext: context
}
const linkedItem: WorkspaceLinkedItem = {
  provider: 'dart',
  type: 'issue',
  number: 0,
  title: dartLink.title ?? '',
  url: dartLink.url ?? '',
  dartIdentifier: taskId
}

// Stored contexts gain null defaults on load, so match the fields a link must carry.
const keptDartLink = expect.objectContaining({
  provider: 'dart',
  type: 'issue',
  number: 0,
  identifier: taskId,
  dartIdentifier: taskId,
  title: dartLink.title,
  url: dartLink.url,
  taskSourceContext: expect.objectContaining(context)
})

function restart<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

describe('a Dart link survives a restart on a git worktree', () => {
  function reload(meta: WorktreeMeta): WorktreeMeta {
    const state = {
      worktreeMeta: { 'repo::/p': restart(meta) },
      worktreeLineageById: {},
      workspaceLineageByChildKey: {}
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the loader reads only these maps.
    normalizeWorktreeLinkedItemMetadata(state as unknown as PersistedState)
    return state.worktreeMeta['repo::/p']
  }

  it('keeps the attachment written through the attach box', () => {
    const written = mergeWorktreeMetaForWrite(
      undefined,
      { linkedItemsBase: [], linkedItems: [dartLink] },
      { instanceId: 'instance-1', hostId: 'local' }
    )
    const loaded = reload(written)
    expect(getWorkspaceAttachments(loaded)).toEqual([keptDartLink])
    expect(loaded.linkedWorkItem).toMatchObject({ provider: 'dart', dartIdentifier: taskId })
    expect(loaded.linkedTaskSourceContext).toMatchObject(context)
  })

  it('keeps the single link written at creation time', () => {
    const written = mergeWorktreeMetaForWrite(
      undefined,
      { linkedWorkItem: linkedItem, linkedTaskSourceContext: context },
      { instanceId: 'instance-1', hostId: 'local' }
    )
    const [attachment] = getWorkspaceAttachments(reload(written))
    expect(attachment).toMatchObject({
      provider: 'dart',
      type: 'issue',
      number: 0,
      dartIdentifier: taskId,
      taskSourceContext: context
    })
  })
})

describe('a Dart link survives a restart on a plain folder workspace', () => {
  const projectGroups: ProjectGroup[] = [
    {
      id: 'group-1',
      name: 'Platform',
      parentPath: '/tmp/folder',
      parentGroupId: null,
      createdFrom: 'manual',
      tabOrder: 0,
      isCollapsed: false,
      color: null,
      createdAt: 1,
      updatedAt: 1
    }
  ]

  function createOperations(): FolderWorkspacePersistenceOperations {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: folder operations read only these fields.
    const state = { projectGroups, folderWorkspaces: [] } as unknown as PersistedState
    return new FolderWorkspacePersistenceOperations({
      state,
      scheduleSave: () => {},
      removeWorkspaceLineageForFolderParent: () => {},
      pruneMobileClientTabSelections: () => {},
      hydrateRepo: (repo) => repo
    })
  }

  it('keeps the link written when the folder is created', () => {
    const operations = createOperations()
    const created = operations.createFolderWorkspace({
      projectGroupId: 'group-1',
      linkedTask: linkedItem,
      linkedItems: [dartLink],
      linkedTaskSourceContext: context
    })
    const [loaded] = normalizeFolderWorkspaces([restart(created)], projectGroups)
    expect(getWorkspaceAttachments(loaded)).toEqual([keptDartLink])
    expect(loaded.linkedTask).toMatchObject({ provider: 'dart', dartIdentifier: taskId })
    expect(loaded.linkedTaskSourceContext).toMatchObject(context)
  })

  it('keeps a link attached later through an update', () => {
    const operations = createOperations()
    const { id } = operations.createFolderWorkspace({ projectGroupId: 'group-1' })
    operations.updateFolderWorkspace(id, { linkedItemsBase: [], linkedItems: [dartLink] })
    const updated = operations.getFolderWorkspace(id)
    const [loaded] = normalizeFolderWorkspaces([restart(updated)], projectGroups)
    expect(getWorkspaceAttachments(loaded)).toEqual([keptDartLink])
    expect(loaded.linkedTask).toMatchObject({ provider: 'dart', dartIdentifier: taskId })
    expect(loaded.linkedTaskSourceContext).toMatchObject(context)
  })
})
