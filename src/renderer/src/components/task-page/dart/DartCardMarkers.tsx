import { Ban, ListTree } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { DartCardInfo } from './dart-board-contracts'

export function DartCardMarkers({ info }: { info: DartCardInfo }): React.JSX.Element | null {
  const blockedBy = info.blockedBy ?? 0
  const blocking = info.blocking ?? 0
  const subtaskCount = info.subtasks ? (info.subtasks.total ?? info.subtasks.loaded) : 0
  const notChecked =
    info.onHold && (info.relationshipState === 'notChecked' || info.relationshipState === 'error')
  if (blockedBy <= 0 && blocking <= 0 && subtaskCount <= 0 && !notChecked) {
    return null
  }
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-muted-foreground">
      {subtaskCount > 0 ? (
        <span
          className="flex items-center gap-1"
          aria-label={translate(
            'auto.components.task.page.dart.DartBoardCard.subtasks',
            'Subtasks {{count}}',
            { count: subtaskCount }
          )}
        >
          <ListTree className="size-3" aria-hidden />
          <span aria-hidden>{subtaskCount}</span>
        </span>
      ) : null}
      {blockedBy > 0 ? (
        <span
          role="img"
          className="flex items-center gap-1 text-foreground"
          aria-label={translate(
            'auto.components.task.page.dart.DartBoardCard.blockedBy',
            'Blocked by {{count}}',
            { count: blockedBy }
          )}
        >
          <Ban className="size-3" aria-hidden />
          <span aria-hidden>{blockedBy}</span>
        </span>
      ) : null}
      {blocking > 0 ? (
        <span
          role="img"
          className="flex items-center gap-1"
          aria-label={translate(
            'auto.components.task.page.dart.DartBoardCard.blocking',
            'Blocking {{count}}',
            { count: blocking }
          )}
        >
          <Ban className="size-3" aria-hidden />
          <span aria-hidden>{blocking}</span>
        </span>
      ) : null}
      {notChecked ? (
        <span>
          {translate(
            'auto.components.task.page.dart.DartBoardCard.blockersNotChecked',
            'Blockers not checked'
          )}
        </span>
      ) : null}
    </div>
  )
}
