import { ArrowRight, ExternalLink, Info, X } from 'lucide-react'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { DartDetailEditApi } from './dart-detail-contracts'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatUiRelativeTimeFromDate } from '@/i18n/relative-time-format'
import { translate } from '@/i18n/i18n'
import { openAppHttpLink } from '@/lib/app-http-link-open'

export function DartTaskDetailHeader({
  task,
  openUrl,
  onUpdate: _onUpdate,
  pendingFields: _pendingFields,
  blockedFields: _blockedFields,
  config: _config,
  supportsWritesV2: _supportsWritesV2,
  viewerName: _viewerName,
  onUse,
  onClose
}: DartDetailEditApi & {
  onUse: (task: DartTask) => void
  onClose: () => void
}): React.JSX.Element {
  return (
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
          <h2 className="mt-1 text-xl font-semibold leading-tight text-foreground">{task.title}</h2>
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
          {translate('auto.components.task.page.dart.TaskDetail.startWorkspace', 'Start workspace')}
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
  )
}
