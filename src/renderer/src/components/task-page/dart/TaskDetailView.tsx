import { ArrowRight, ExternalLink, Info, Layers, RefreshCw, X } from 'lucide-react'
import type { DartComment, DartTask } from '../../../../../shared/dart/dart-types'
import type { Worktree } from '../../../../../shared/worktree/types'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatUiRelativeTimeFromDate } from '@/i18n/relative-time-format'
import { getIntlLocale, translate } from '@/i18n/i18n'
import { openAppHttpLink } from '@/lib/app-http-link-open'
import { cn } from '@/lib/utils'
import { getDartStatusTone, getDartTaskOpenUrl } from './task-page-dart-list-model'

export type DartDetailLoadState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; value: T }

export type DartCommentsView = {
  comments: readonly DartComment[]
  totalCount: number
}

export type DartTaskDetailViewProps = {
  task: DartTask
  description: DartDetailLoadState<string>
  comments: DartDetailLoadState<DartCommentsView>
  workspaces: readonly Worktree[]
  onUse: (task: DartTask) => void
  onClose: () => void
  onRetry: () => void
  onOpenWorkspace: (workspace: Worktree) => void
}

function formatDueDate(value: string | null | undefined): string | null {
  const time = value ? Date.parse(value) : Number.NaN
  return Number.isNaN(time) ? null : new Date(time).toLocaleDateString(getIntlLocale())
}

function MetadataItem({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-2xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-xs text-foreground">{children}</dd>
    </div>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <h3 className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  )
}

function InlineError({
  message,
  onRetry
}: {
  message: string
  onRetry: () => void
}): React.JSX.Element {
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
    >
      <span className="min-w-0 break-words">{message}</span>
      <Button type="button" variant="ghost" size="xs" onClick={onRetry}>
        <RefreshCw className="size-3" />
        {translate('auto.components.task.page.dart.TaskDetail.retry', 'Retry')}
      </Button>
    </div>
  )
}

function SkeletonLines(): React.JSX.Element {
  return (
    <div className="space-y-2" aria-hidden>
      <div className="h-3 w-4/5 animate-pulse rounded bg-muted/70" />
      <div className="h-3 w-3/5 animate-pulse rounded bg-muted/60" />
    </div>
  )
}

export function DartTaskDetailView({
  task,
  description,
  comments,
  workspaces,
  onUse,
  onClose,
  onRetry,
  onOpenWorkspace
}: DartTaskDetailViewProps): React.JSX.Element {
  const openUrl = getDartTaskOpenUrl(task)
  const due = formatDueDate(task.dueAt)
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="flex-none border-b border-border/50 bg-muted/30 px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-muted-foreground">
              <span>
                {translate('auto.components.task.page.dart.TaskDetail.dartTasks', 'Dart tasks')}
              </span>
              {task.dartboard ? (
                <>
                  <span aria-hidden>/</span>
                  <span className="min-w-0 truncate">{task.dartboard}</span>
                </>
              ) : null}
              {task.updatedAt ? <span>{formatUiRelativeTimeFromDate(task.updatedAt)}</span> : null}
            </div>
            <h2 className="mt-1 text-xl font-semibold leading-tight text-foreground">
              {task.title}
            </h2>
          </div>
          {openUrl ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="hidden shrink-0 sm:inline-flex"
              onClick={(event) => openAppHttpLink(openUrl, { event })}
            >
              <ExternalLink className="size-3.5" />
              {translate('auto.components.task.page.dart.TaskDetail.openInDart', 'Open in Dart')}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            className="hidden shrink-0 sm:inline-flex"
            onClick={() => onUse(task)}
          >
            {translate(
              'auto.components.task.page.dart.TaskDetail.startWorkspace',
              'Start workspace'
            )}
            <ArrowRight className="size-4" />
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0"
                onClick={onClose}
                aria-label={translate(
                  'auto.components.task.page.dart.TaskDetail.closeTask',
                  'Close Dart task preview'
                )}
              >
                <X className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              {translate('auto.components.task.page.dart.TaskDetail.close', 'Close')}
            </TooltipContent>
          </Tooltip>
        </div>
        {openUrl ? null : (
          <p
            role="status"
            className="mt-2 flex items-start gap-2 rounded-md border border-border/50 bg-muted/35 px-2.5 py-1.5 text-xs text-muted-foreground"
          >
            <Info className="mt-0.5 size-3.5 flex-none" />
            {translate(
              'auto.components.task.page.dart.TaskDetail.invalidTaskUrl',
              'Dart sent a link for this task that Orca could not verify, so it is not shown.'
            )}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-border/60 px-4 py-3 sm:grid-cols-4">
          <MetadataItem
            label={translate('auto.components.task.page.dart.TaskDetail.status', 'Status')}
          >
            {task.status ? (
              <span
                className={cn(
                  'inline-flex max-w-full items-center rounded-full border px-1.5 py-0.5 text-2xs font-medium',
                  getDartStatusTone(task.status)
                )}
              >
                <span className="truncate">{task.status}</span>
              </span>
            ) : (
              '—'
            )}
          </MetadataItem>
          <MetadataItem
            label={translate('auto.components.task.page.dart.TaskDetail.priority', 'Priority')}
          >
            {task.priority ?? '—'}
          </MetadataItem>
          <MetadataItem
            label={translate('auto.components.task.page.dart.TaskDetail.assignee', 'Assignee')}
          >
            {task.assignee ??
              translate('auto.components.task.page.dart.TaskDetail.unassigned', 'Unassigned')}
          </MetadataItem>
          <MetadataItem label={translate('auto.components.task.page.dart.TaskDetail.due', 'Due')}>
            {due ?? '—'}
          </MetadataItem>
        </dl>

        {task.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1 border-b border-border/60 px-4 py-2.5">
            {task.tags.map((tag) => (
              <span
                key={tag}
                className="max-w-40 truncate rounded-full border border-border/50 bg-muted/35 px-1.5 py-0.5 text-2xs text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <section className="space-y-2 px-4 py-4">
          <SectionHeading>
            {translate('auto.components.task.page.dart.TaskDetail.description', 'Description')}
          </SectionHeading>
          {description.status === 'loading' ? <SkeletonLines /> : null}
          {description.status === 'error' ? (
            <InlineError message={description.message} onRetry={onRetry} />
          ) : null}
          {description.status === 'ready' ? (
            description.value.trim() ? (
              <CommentMarkdown content={description.value} variant="document" />
            ) : (
              <p className="text-xs text-muted-foreground">
                {translate(
                  'auto.components.task.page.dart.TaskDetail.noDescription',
                  'No description.'
                )}
              </p>
            )
          ) : null}
        </section>

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

        <section className="space-y-3 border-t border-border/60 px-4 py-4">
          <SectionHeading>
            {comments.status === 'ready'
              ? translate(
                  'auto.components.task.page.dart.TaskDetail.commentsCount',
                  'Comments · {{count}}',
                  { count: comments.value.totalCount }
                )
              : translate('auto.components.task.page.dart.TaskDetail.comments', 'Comments')}
          </SectionHeading>
          {comments.status === 'loading' ? <SkeletonLines /> : null}
          {comments.status === 'error' ? (
            <InlineError message={comments.message} onRetry={onRetry} />
          ) : null}
          {comments.status === 'ready' && comments.value.comments.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {translate(
                'auto.components.task.page.dart.TaskDetail.noComments',
                'No comments yet.'
              )}
            </p>
          ) : null}
          {comments.status === 'ready'
            ? comments.value.comments.map((comment) => (
                <article key={comment.id} className="flex gap-2.5">
                  <span
                    aria-hidden
                    className="flex size-6 flex-none items-center justify-center rounded-full bg-muted text-2xs font-medium text-muted-foreground"
                  >
                    {comment.author.trim().charAt(0).toUpperCase() || '?'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-2xs text-muted-foreground">
                      <span className="font-medium text-foreground">{comment.author}</span>
                      {comment.createdAt
                        ? ` · ${formatUiRelativeTimeFromDate(comment.createdAt)}`
                        : null}
                    </div>
                    <CommentMarkdown
                      content={comment.text}
                      variant="compact"
                      className="mt-0.5 text-xs"
                    />
                  </div>
                </article>
              ))
            : null}
          {comments.status === 'ready' &&
          comments.value.totalCount > comments.value.comments.length ? (
            <p className="text-2xs text-muted-foreground">
              {translate(
                'auto.components.task.page.dart.TaskDetail.commentsTruncated',
                'Showing first {{shown}} of {{total}} comments.',
                {
                  shown: comments.value.comments.length,
                  total: comments.value.totalCount
                }
              )}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  )
}
