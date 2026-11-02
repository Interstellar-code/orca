import type React from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { taskProviderErrorMessage } from '@/lib/task-provider-error-copy'
import type { DartAttachmentUrlSource } from './use-dart-attachment-url-source'

export function WorkspaceAttachmentDartStatus({
  source,
  disabled
}: {
  source: DartAttachmentUrlSource
  disabled: boolean
}): React.JSX.Element {
  const message = source.invalidTaskUrl
    ? taskProviderErrorMessage({ errorCode: 'dart.invalidTaskUrl' })
    : (source.error ??
      (source.loading
        ? translate(
            'auto.components.sidebar.WorkspaceAttachmentDartStatus.loadingDart',
            'Loading Dart task…'
          )
        : translate('workspace.links.inlineSearchHint', 'Select a result to attach it.')))
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground"
    >
      <span>{message}</span>
      {source.error ? (
        <Button type="button" variant="link" size="xs" disabled={disabled} onClick={source.retry}>
          {translate('workspace.links.retrySource', 'Retry')}
        </Button>
      ) : null}
    </div>
  )
}
