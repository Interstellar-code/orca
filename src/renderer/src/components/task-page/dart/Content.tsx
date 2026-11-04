import { AlertCircle, Info, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { Worktree } from '../../../../../shared/worktree/types'
import { DartConnectDialog } from '@/components/dart/dart-connect-dialog'
import { DartIcon } from '@/components/icons/DartIcon'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { taskProviderErrorText } from '@/lib/task-provider-error-copy'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { dartUpdateRequiredMessage } from '@/runtime/runtime-dart-client'
import type { TaskPageComposerActionsModel } from '../use-task-page-composer-actions'
import { TaskPageDartTaskList } from './TaskList'
import { TaskPageDartTaskDetail } from './TaskDetail'
import { TaskPageDartCreateDialog } from './TaskCreateDialog'
import { isDartAuthFailureCode, isDartListTruncated } from './task-page-dart-list-model'

function CenteredState({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="mt-4 flex flex-col items-center justify-center rounded-md border border-border/50 bg-muted/50 px-6 py-14 text-center shadow-sm">
      {children}
    </div>
  )
}

export function TaskPageDartContent({
  model
}: {
  model: TaskPageComposerActionsModel
}): React.JSX.Element | null {
  const {
    dartStatus,
    dartStatusReady,
    dartConnected,
    dartUpdateRequired,
    dartConnectOpen,
    setDartConnectOpen,
    hideTaskSource,
    dartTasks,
    dartTotalCount,
    dartLoading,
    dartError,
    dartHasWorkspace,
    getDartTaskWorkspaces,
    selectedDartTask,
    dartDetailSourceContext,
    openDartDetailPage,
    closeTaskDetailPage,
    handleUseDartItem
  } = model

  const openWorkspace = (workspace: Worktree): void => {
    if (
      activateAndRevealWorktree(workspace.id, {
        navigationIntent: 'user-open'
      }) === false
    ) {
      toast.error(
        translate(
          'auto.components.task.page.dart.Content.openWorkspaceFailed',
          'Unable to open the workspace linked to this Dart task.'
        )
      )
    }
  }
  const connectDialog = (
    <DartConnectDialog open={dartConnectOpen} onOpenChange={setDartConnectOpen} />
  )

  if (dartUpdateRequired) {
    return (
      <CenteredState>
        <DartIcon className="mb-4 size-8 text-muted-foreground/60" />
        <p className="text-base font-medium text-foreground">{dartUpdateRequiredMessage()}</p>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          {translate(
            'auto.components.task.page.dart.Content.updateServerHint',
            'This remote server was built before Dart support. Update it, or switch to a different environment.'
          )}
        </p>
        <div className="mt-5">
          <Button variant="outline" onClick={() => hideTaskSource('dart', 'Dart')}>
            {translate('auto.components.task.page.dart.Content.hideDart', 'Hide Dart')}
          </Button>
        </div>
      </CenteredState>
    )
  }

  if (!dartStatusReady) {
    return (
      <div className="mt-4 flex items-center justify-center py-14">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!dartConnected) {
    return (
      <>
        <CenteredState>
          <DartIcon className="mb-4 size-8 text-muted-foreground/60" />
          <p className="text-base font-medium text-foreground">
            {translate(
              'auto.components.task.page.dart.Content.connectTitle',
              'Connect your Dart account'
            )}
          </p>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            {translate(
              'auto.components.task.page.dart.Content.connectBody',
              'Browse Dart tasks and start workspaces from them.'
            )}
          </p>
          {dartStatus.credentialError ? (
            <p role="alert" className="mt-3 max-w-sm text-sm text-destructive">
              {taskProviderErrorText(dartStatus.credentialError)}
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <Button onClick={() => setDartConnectOpen(true)}>
              {translate('auto.components.task.page.dart.Content.connectDart', 'Connect Dart')}
            </Button>
            <Button variant="outline" onClick={() => hideTaskSource('dart', 'Dart')}>
              {translate('auto.components.task.page.dart.Content.hideDart', 'Hide Dart')}
            </Button>
          </div>
        </CenteredState>
        {connectDialog}
      </>
    )
  }

  const truncated = !dartHasWorkspace && isDartListTruncated(dartTasks.length, dartTotalCount)
  const authFailed = isDartAuthFailureCode(dartError?.code)
  const showEmpty = !dartLoading && dartTasks.length === 0 && !dartError

  return (
    <div className="@container flex min-h-0 max-h-full flex-col overflow-hidden rounded-md rounded-t-none border border-t-0 border-border/50 bg-background shadow-sm">
      <div className="flex min-h-10 flex-none flex-wrap items-center justify-between gap-3 border-b border-border/50 bg-muted/35 px-3 py-1">
        <div className="min-w-0 text-2xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {translate('auto.components.task.page.dart.Content.listTitle', 'Dart tasks')}
        </div>
        <div className="shrink-0 text-2xs text-muted-foreground">
          {translate('auto.components.task.page.dart.Content.shownCount', '{{count}} shown', {
            count: dartTasks.length
          })}
        </div>
      </div>
      <div
        className="min-h-0 flex-1 overflow-auto scrollbar-sleek"
        style={{ scrollbarGutter: 'stable' }}
      >
        {truncated ? (
          <div
            role="status"
            className="flex items-start gap-2 border-b border-border/50 bg-muted/35 px-4 py-2 text-xs text-muted-foreground"
          >
            <Info className="mt-0.5 size-3.5 flex-none" />
            <span>
              {translate(
                'auto.components.task.page.dart.Content.truncated',
                'Showing first {{count}} of {{total}} tasks. Narrow the filters to see the rest.',
                { count: dartTasks.length, total: dartTotalCount }
              )}
            </span>
          </div>
        ) : null}

        {dartError ? (
          <div
            role="alert"
            className="flex items-start gap-2 border-b border-border bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 flex-none" />
            <div className="min-w-0 flex-1">
              <div className="font-medium leading-5">
                {dartError.message ||
                  translate(
                    'auto.components.task.page.dart.Content.loadFailed',
                    'Failed to load Dart tasks.'
                  )}
              </div>
              {authFailed ? (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="mt-2"
                  onClick={() => setDartConnectOpen(true)}
                >
                  {translate('auto.components.task.page.dart.Content.reconnect', 'Reconnect Dart')}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {dartLoading && dartTasks.length === 0 ? (
          <div className="divide-y divide-border/50" aria-hidden>
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="px-3 py-3">
                <div className="h-4 w-4/5 animate-pulse rounded bg-muted/70" />
                <div className="mt-2 h-3 w-3/5 animate-pulse rounded bg-muted/60" />
              </div>
            ))}
          </div>
        ) : null}

        {showEmpty ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium text-foreground">
              {translate(
                'auto.components.task.page.dart.Content.emptyTitle',
                'No Dart tasks found'
              )}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {dartHasWorkspace
                ? translate(
                    'auto.components.task.page.dart.Content.emptyLinked',
                    'Link a Dart task to a workspace, or choose another view.'
                  )
                : translate(
                    'auto.components.task.page.dart.Content.emptyFiltered',
                    'No tasks match these filters. Try All tasks or clear the search.'
                  )}
            </p>
          </div>
        ) : null}

        {dartTasks.length > 0 ? (
          <TaskPageDartTaskList
            tasks={dartTasks}
            selectedTaskId={selectedDartTask?.id ?? null}
            getTaskWorkspaces={getDartTaskWorkspaces}
            onOpenTask={openDartDetailPage}
            onStartWorkspace={handleUseDartItem}
            onOpenWorkspace={openWorkspace}
          />
        ) : null}
      </div>

      <TaskPageDartTaskDetail
        task={selectedDartTask}
        sourceContext={dartDetailSourceContext}
        workspaces={selectedDartTask ? getDartTaskWorkspaces(selectedDartTask) : []}
        onUse={(task: DartTask) => handleUseDartItem(task)}
        onClose={closeTaskDetailPage}
        onOpenWorkspace={openWorkspace}
      />
      <TaskPageDartCreateDialog model={model} />
      {connectDialog}
    </div>
  )
}
