import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { translate } from '@/i18n/i18n'
import { InlineError, SkeletonLines } from './TaskDetailLoadStates'
import { SectionHeading } from './TaskDetailSectionHeading'
import type { DartDetailLoadState } from './TaskDetailView'

export function DartTaskDetailDescription({
  description,
  onRetry
}: {
  description: DartDetailLoadState<string>
  onRetry: () => void
}): React.JSX.Element {
  return (
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
  )
}
