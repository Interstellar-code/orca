import { parseDartTaskUrl } from '../../../shared/dart/dart-issue-url'
import type { DartTask } from '../../../shared/dart/dart-types'
import type { TaskSourceContext } from '../../../shared/task-source-context'
import { getWorkspaceAttachments } from '../../../shared/workspace-attachments'
import type { WorkspaceAttachment, Worktree } from '../../../shared/worktree/types'

export type DartTaskWorkspaceAttachmentIndex = ReadonlyMap<string, readonly Worktree[]>
export type LinkedDartTaskRef = { taskId: string; sourceContext?: TaskSourceContext }

// Dart ids are case-sensitive; the slug-free id is the only identity a link carries.
export function dartAttachmentTaskId(item: WorkspaceAttachment): string | null {
  if (item.provider !== 'dart') {
    return null
  }
  const value = (item.identifier ?? item.dartIdentifier ?? '').trim()
  return value || (item.url ? (parseDartTaskUrl(item.url)?.taskId ?? null) : null)
}

// Why host only: Dart identity is the user id and the label is display-only; legacy links are local.
function sameSource(item: WorkspaceAttachment, source?: TaskSourceContext | null): boolean {
  return !source || (item.taskSourceContext?.hostId ?? 'local') === source.hostId
}

export function dartAttachmentMatchesTask(
  item: WorkspaceAttachment,
  task: Pick<DartTask, 'id'>,
  source?: TaskSourceContext | null
): boolean {
  return dartAttachmentTaskId(item) === task.id && sameSource(item, source)
}

export function buildDartTaskWorkspaceAttachmentIndex(
  workspaces: readonly Worktree[]
): DartTaskWorkspaceAttachmentIndex {
  const index = new Map<string, Worktree[]>()
  for (const workspace of workspaces) {
    if (workspace.isArchived) {
      continue
    }
    const ids = new Set(getWorkspaceAttachments(workspace).map(dartAttachmentTaskId))
    for (const id of ids) {
      if (!id) {
        continue
      }
      const bucket = index.get(id)
      if (bucket) {
        bucket.push(workspace)
      } else {
        index.set(id, [workspace])
      }
    }
  }
  return index
}

export function findDartTaskWorkspaceAttachmentsInIndex(
  index: DartTaskWorkspaceAttachmentIndex,
  task: Pick<DartTask, 'id'>,
  source?: TaskSourceContext | null
): readonly Worktree[] {
  return (index.get(task.id) ?? [])
    .filter((workspace) =>
      getWorkspaceAttachments(workspace).some((item) =>
        dartAttachmentMatchesTask(item, task, source)
      )
    )
    .toSorted((a, b) => b.lastActivityAt - a.lastActivityAt)
}

export function collectLinkedDartTaskRefs(
  workspaces: readonly Worktree[],
  source?: TaskSourceContext | null
): LinkedDartTaskRef[] {
  const refs = new Map<string, LinkedDartTaskRef>()
  for (const workspace of workspaces) {
    if (workspace.isArchived) {
      continue
    }
    for (const item of getWorkspaceAttachments(workspace)) {
      const taskId = dartAttachmentTaskId(item)
      if (!taskId || !sameSource(item, source)) {
        continue
      }
      refs.set(taskId, {
        taskId,
        ...(item.taskSourceContext ? { sourceContext: item.taskSourceContext } : {})
      })
    }
  }
  return [...refs.values()].toSorted((a, b) => a.taskId.localeCompare(b.taskId))
}
