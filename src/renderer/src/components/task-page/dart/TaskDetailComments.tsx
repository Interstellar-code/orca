import { useCallback, useSyncExternalStore } from 'react'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { Button } from '@/components/ui/button'
import { formatUiRelativeTimeFromDate } from '@/i18n/relative-time-format'
import { translate } from '@/i18n/i18n'
import type { DartComment } from '../../../../../shared/dart/dart-types'
import { DartCommentComposer } from './DartCommentComposer'
import { buildDartCommentThread } from './dart-comment-thread'
import {
  getDartReplyTarget,
  setDartReplyTarget,
  subscribeDartReplyTargets
} from './dart-reply-target-store'
import type { DartDetailCommentsApi } from './dart-detail-contracts'
import { getDartCommentSendState, subscribeDartCommentSendState } from './dart-comment-send-state'
import { InlineError, SkeletonLines } from './TaskDetailLoadStates'
import { SectionHeading } from './TaskDetailSectionHeading'

// Replies step in by one avatar width; deeper threads stay readable on a narrow sheet.
const REPLY_INDENT = 16
const MAX_INDENT_DEPTH = 6

export function DartTaskDetailComments(
  props: DartDetailCommentsApi & {
    onRetry: () => void
    readLatestComments: () => Promise<DartComment[]>
    viewerName: string | null
    viewerEmail?: string | null
  }
): React.JSX.Element {
  return <DartTaskDetailCommentsForTask key={props.draftKey} {...props} />
}

function DartTaskDetailCommentsForTask({
  comments,
  onAddComment,
  reloadComments,
  appendLocalComment,
  draftKey,
  onRetry,
  readLatestComments,
  viewerName,
  viewerEmail = null
}: DartDetailCommentsApi & {
  onRetry: () => void
  readLatestComments: () => Promise<DartComment[]>
  viewerName: string | null
  viewerEmail?: string | null
}): React.JSX.Element {
  // Item 9: the reply target rides the draft, so closing or switching restores it.
  const getReplyTo = useCallback((): DartComment | null => getDartReplyTarget(draftKey), [draftKey])
  const replyTo = useSyncExternalStore(subscribeDartReplyTargets, getReplyTo, getReplyTo)
  const cancelReply = useCallback((): void => setDartReplyTarget(draftKey, null), [draftKey])
  const getSendState = useCallback(() => getDartCommentSendState(draftKey), [draftKey])
  const { inFlight } = useSyncExternalStore(
    subscribeDartCommentSendState,
    getSendState,
    getSendState
  )

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
        ? buildDartCommentThread(comments.value.comments).map(({ comment, depth }) => (
            <article
              key={comment.id}
              data-depth={depth}
              className="flex gap-2.5"
              style={{ paddingLeft: Math.min(depth, MAX_INDENT_DEPTH) * REPLY_INDENT }}
            >
              <span
                aria-hidden
                className="flex size-6 flex-none items-center justify-center rounded-full bg-muted text-2xs font-medium text-muted-foreground"
              >
                {comment.author.trim().charAt(0).toUpperCase() || '?'}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 text-2xs text-muted-foreground">
                  <span className="min-w-0 truncate">
                    <span className="font-medium text-foreground">{comment.author}</span>
                    {comment.createdAt
                      ? ` · ${formatUiRelativeTimeFromDate(comment.createdAt)}`
                      : null}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="ms-auto"
                    disabled={inFlight}
                    onClick={() => {
                      if (!getDartCommentSendState(draftKey).inFlight) {
                        setDartReplyTarget(draftKey, comment)
                      }
                    }}
                  >
                    {translate(
                      'auto.components.right.sidebar.checks.panel.content.c1f6fc006a',
                      'Reply'
                    )}
                  </Button>
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
      <DartCommentComposer
        draftKey={draftKey}
        replyTo={replyTo}
        onCancelReply={cancelReply}
        onAddComment={onAddComment}
        reloadComments={reloadComments}
        readLatestComments={readLatestComments}
        viewerName={viewerName}
        viewerEmail={viewerEmail}
        appendLocalComment={appendLocalComment}
      />
    </section>
  )
}
