import { Layers } from 'lucide-react'
import type { DartComment, DartTask } from '../../../../../shared/dart/dart-types'
import type { Worktree } from '../../../../../shared/worktree/types'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { DartRelationshipsApi } from './dart-board-contracts'
import type {
  DartDetailCommentsApi,
  DartDetailDescriptionApi,
  DartDetailEditApi,
  DartNoticeApi
} from './dart-detail-contracts'
import { DartTaskDetailComments } from './TaskDetailComments'
import { DartTaskDetailDescription } from './TaskDetailDescription'
import { DartTaskDetailHeader } from './TaskDetailHeader'
import { DartTaskDetailNotice } from './TaskDetailNotice'
import { DartTaskDetailProperties } from './TaskDetailProperties'
import { SectionHeading } from './TaskDetailSectionHeading'
import { dartRelationshipsKnown, TaskDetailRelationships } from './TaskDetailRelationships'
import { TaskDetailSubtasks } from './TaskDetailSubtasks'

export type DartDetailLoadState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; value: T }

export type DartCommentsView = {
  comments: readonly DartComment[]
  totalCount: number
}

export type DartTaskDetailViewProps = {
  edit: DartDetailEditApi
  commentsApi: DartDetailCommentsApi & {
    readLatestComments(): Promise<DartComment[]>
    viewerName: string | null
    viewerEmail?: string | null
  }
  descriptionApi: DartDetailDescriptionApi
  notice: DartNoticeApi
  /** Absent hides the relationship sections (release A fixtures, hosts without links). */
  relationships?: DartRelationshipsApi
  onOpenRelatedTask?: (task: DartTask) => void
  workspaces: readonly Worktree[]
  onUse: (task: DartTask) => void
  onClose: () => void
  onRetry: () => void
  onOpenWorkspace: (workspace: Worktree) => void
}

export function DartTaskDetailView({
  edit,
  commentsApi,
  descriptionApi,
  notice,
  relationships,
  onOpenRelatedTask,
  workspaces,
  onUse,
  onClose,
  onRetry,
  onOpenWorkspace
}: DartTaskDetailViewProps): React.JSX.Element {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <DartTaskDetailHeader {...edit} onUse={onUse} onClose={onClose} />

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek">
        {/* The description editor shows its own notices. */}
        {notice.notice && notice.notice.field !== 'description' ? (
          <div className="mx-4 mt-3">
            <DartTaskDetailNotice {...notice} />
          </div>
        ) : null}
        <DartTaskDetailProperties {...edit} />

        {relationships && onOpenRelatedTask ? (
          <>
            <TaskDetailRelationships
              relationships={relationships}
              onOpenRelatedTask={onOpenRelatedTask}
            />
            {dartRelationshipsKnown(relationships) ? (
              <TaskDetailSubtasks
                relationships={relationships}
                onOpenRelatedTask={onOpenRelatedTask}
              />
            ) : null}
          </>
        ) : null}

        <DartTaskDetailDescription {...descriptionApi} onRetry={onRetry} />

        <section className="space-y-2 border-t border-border/60 px-4 py-4">
          <SectionHeading>
            {translate(
              'auto.components.task.page.dart.TaskDetail.linkedWorkspaces',
              'Linked workspaces'
            )}
          </SectionHeading>
          {workspaces.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {translate(
                'auto.components.task.page.dart.TaskDetail.noLinkedWorkspaces',
                'No workspace is linked to this task yet.'
              )}
            </p>
          ) : (
            <ul className="space-y-1">
              {workspaces.map((workspace) => (
                <li key={workspace.id}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="max-w-full justify-start"
                    onClick={() => onOpenWorkspace(workspace)}
                  >
                    <Layers className="size-3.5" />
                    <span className="min-w-0 truncate">
                      {workspace.displayName || workspace.branch || workspace.path}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <DartTaskDetailComments {...commentsApi} onRetry={onRetry} />
      </div>
    </div>
  )
}
