import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { translate } from '@/i18n/i18n'
import type { DartDetailDescriptionApi } from './dart-detail-contracts'
import { InlineError, SkeletonLines } from './TaskDetailLoadStates'
import { SectionHeading } from './TaskDetailSectionHeading'

export function DartTaskDetailDescription({
  task: _task,
  openUrl: _openUrl,
  supportsWritesV2: _supportsWritesV2,
  description,
  readLatestTask: _readLatestTask,
  onSavePatch: _onSavePatch,
  registerCloseGuard: _registerCloseGuard,
  pendingFields: _pendingFields,
  blockedFields: _blockedFields,
  notice: _notice,
  draftKey: _draftKey,
  onRetry
}: DartDetailDescriptionApi & { onRetry: () => void }): React.JSX.Element {
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
