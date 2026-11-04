import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { formatUiRelativeTimeFromDate } from '@/i18n/relative-time-format'
import { translate } from '@/i18n/i18n'
import { InlineError, SkeletonLines } from './TaskDetailLoadStates'
import { SectionHeading } from './TaskDetailSectionHeading'
import type { DartCommentsView, DartDetailLoadState } from './TaskDetailView'

export function DartTaskDetailComments({
  comments,
  onRetry
}: {
  comments: DartDetailLoadState<DartCommentsView>
  onRetry: () => void
}): React.JSX.Element {
  return (
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
          {translate('auto.components.task.page.dart.TaskDetail.noComments', 'No comments yet.')}
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
      {comments.status === 'ready' && comments.value.totalCount > comments.value.comments.length ? (
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
  )
}
