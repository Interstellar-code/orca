import { useEffect, useRef } from 'react'
import * as VisuallyHidden from 'radix-ui/visually-hidden'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import type { Worktree } from '../../../../../shared/worktree/types'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { translate } from '@/i18n/i18n'
import { DartTaskDetailView } from './TaskDetailView'
import { useDartTaskDetailData } from './use-dart-task-detail-data'

export function TaskPageDartTaskDetail({
  task,
  sourceContext,
  workspaces,
  onUse,
  onClose,
  onOpenWorkspace
}: {
  task: DartTask | null
  sourceContext: TaskSourceContext | null
  workspaces: readonly Worktree[]
  onUse: (task: DartTask) => void
  onClose: () => void
  onOpenWorkspace: (workspace: Worktree) => void
}): React.JSX.Element {
  const data = useDartTaskDetailData(task, sourceContext)
  const { runCloseGuards } = data
  const displayed = data.task
  const openTaskIdRef = useRef(task?.id ?? null)
  const closePendingRef = useRef(false)
  useEffect(() => {
    openTaskIdRef.current = task?.id ?? null
    closePendingRef.current = false
  }, [task?.id])
  // A guard that refuses or throws leaves the sheet open; a second close waits for the first, and a result for another task is dropped.
  const requestClose = async (): Promise<void> => {
    if (closePendingRef.current) {
      return
    }
    closePendingRef.current = true
    const openedFor = openTaskIdRef.current
    try {
      const allowed = await runCloseGuards().catch(() => false)
      if (allowed && openTaskIdRef.current === openedFor) {
        onClose()
      }
    } finally {
      closePendingRef.current = false
    }
  }
  const notice = {
    notice: data.notice,
    dismissNotice: data.dismissNotice,
    recheckNotice: data.recheckNotice
  }
  return (
    <Sheet open={task !== null} onOpenChange={(open) => !open && void requestClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-[min(92vw,780px)] sm:max-w-[780px]"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <VisuallyHidden.Root asChild>
          <SheetTitle>
            {displayed?.title ??
              translate('auto.components.task.page.dart.TaskDetail.sheetTitle', 'Dart task')}
          </SheetTitle>
        </VisuallyHidden.Root>
        <VisuallyHidden.Root asChild>
          <SheetDescription>
            {translate(
              'auto.components.task.page.dart.TaskDetail.sheetDescription',
              'Read the selected Dart task and start work from it.'
            )}
          </SheetDescription>
        </VisuallyHidden.Root>
        {displayed && data.commentDraftKey && data.descriptionDraftKey ? (
          <DartTaskDetailView
            edit={{
              task: displayed,
              openUrl: data.openUrl,
              onUpdate: data.onUpdate,
              pendingFields: data.pendingFields,
              blockedFields: data.blockedFields,
              config: data.config,
              supportsWritesV2: data.supportsWritesV2,
              viewerName: data.viewerName
            }}
            commentsApi={{
              comments: data.comments,
              onAddComment: data.onAddComment,
              reloadComments: data.reloadComments,
              appendLocalComment: data.appendLocalComment,
              readLatestComments: data.readLatestComments,
              viewerName: data.viewerName,
              viewerEmail: data.viewerEmail,
              draftKey: data.commentDraftKey
            }}
            descriptionApi={{
              task: displayed,
              openUrl: data.openUrl,
              supportsWritesV2: data.supportsWritesV2,
              description: data.description,
              readLatestTask: data.readLatestTask,
              onSavePatch: data.onSavePatch,
              registerCloseGuard: data.registerCloseGuard,
              pendingFields: data.pendingFields,
              blockedFields: data.blockedFields,
              notice,
              draftKey: data.descriptionDraftKey
            }}
            notice={notice}
            workspaces={workspaces}
            onUse={onUse}
            onClose={() => void requestClose()}
            onRetry={data.retry}
            onOpenWorkspace={onOpenWorkspace}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
