import * as VisuallyHidden from 'radix-ui/visually-hidden'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import type { Worktree } from '../../../../../shared/worktree/types'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { translate } from '@/i18n/i18n'
import { DartTaskDetailView, type DartDetailLoadState } from './TaskDetailView'
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
  const { full, comments, retry } = useDartTaskDetailData(task, sourceContext)
  const displayed = full.status === 'ready' ? full.value : task
  const description: DartDetailLoadState<string> =
    full.status === 'ready'
      ? { status: 'ready', value: full.value.description ?? '' }
      : full.status === 'error'
        ? full
        : { status: 'loading' }
  return (
    <Sheet open={task !== null} onOpenChange={(open) => !open && onClose()}>
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
        {displayed ? (
          <DartTaskDetailView
            task={displayed}
            description={description}
            comments={comments}
            workspaces={workspaces}
            onUse={onUse}
            onClose={onClose}
            onRetry={retry}
            onOpenWorkspace={onOpenWorkspace}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
