import { useMemo } from 'react'
import { MoveRight } from 'lucide-react'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { getIntlLocale, translate } from '@/i18n/i18n'
import { writeDartBoardTaskDragData } from '@/lib/dart-board-drag-payload'
import { cn } from '@/lib/utils'
import type { DartTaskIdentity } from '@/store/slices/dart/dart-task-identity'
import type { DartBoardModel } from './dart-board-contracts'
import { DartCardMarkers } from './DartCardMarkers'
import { formatDartDate } from './dart-date-format'
import { dismissDartTaskNotice, recheckDartTaskNotice } from './dart-task-write-queue'
import { DartTaskDetailNotice } from './TaskDetailNotice'
import { useDartTaskWriteState } from './use-dart-task-detail-writes'

const MAX_TAG_CHIPS = 3

export type DartBoardCardProps = {
  task: DartTask
  model: DartBoardModel
  current: boolean
  onMoveTo(status: string): void
  onDragStartTask?(): void
  onDragEndTask?(): void
  menuOpen: boolean
  onMenuOpenChange(open: boolean): void
  moveButtonRef?: React.Ref<HTMLButtonElement>
  /** The board finds this element by `data-dart-card-id` to restore focus. */
  cardRef?: React.Ref<HTMLDivElement>
}

export function DartBoardCard({
  task,
  model,
  current,
  onMoveTo,
  onDragStartTask,
  onDragEndTask,
  menuOpen,
  onMenuOpenChange,
  moveButtonRef,
  cardRef
}: DartBoardCardProps): React.JSX.Element {
  const { hostKey, accountKey } = model
  const identity = useMemo<DartTaskIdentity>(
    () => ({ hostKey, accountKey, taskId: task.id }),
    [hostKey, accountKey, task.id]
  )
  const writes = useDartTaskWriteState(identity)
  const statusLocked = writes.pendingFields.has('status') || writes.blockedFields.has('status')
  const dueDate = formatDartDate(task.dueAt, getIntlLocale())
  const shownTags = task.tags.slice(0, MAX_TAG_CHIPS)
  const extraTags = task.tags.length - shownTags.length
  const info = model.cardInfo(task.id)

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      data-dart-card-id={task.id}
      data-current={current ? 'true' : undefined}
      aria-current={current ? 'true' : undefined}
      draggable={!statusLocked}
      onDragStart={(event) => {
        if (
          statusLocked ||
          !writeDartBoardTaskDragData(event.dataTransfer, { taskId: task.id, hostKey })
        ) {
          event.preventDefault()
          return
        }
        onDragStartTask?.()
      }}
      onDragEnd={onDragEndTask}
      onClick={() => model.onOpenTask(task)}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && event.key === 'Enter') {
          event.preventDefault()
          model.onOpenTask(task)
        }
      }}
      className={cn(
        'group/card flex flex-col gap-1.5 rounded-md border border-border/50 bg-background px-3 py-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring motion-reduce:transition-none',
        !statusLocked && 'cursor-grab active:cursor-grabbing',
        statusLocked && 'cursor-pointer',
        current && 'bg-accent'
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <span className="line-clamp-2 min-w-0 text-[13px] font-medium leading-snug text-foreground">
          {task.title}
        </span>
        <DropdownMenu open={menuOpen} onOpenChange={onMenuOpenChange}>
          <DropdownMenuTrigger asChild>
            <Button
              ref={moveButtonRef}
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={statusLocked}
              aria-label={translate(
                'auto.components.task.page.dart.DartBoardCard.moveTo',
                'Move “{{title}}” to…',
                { title: task.title }
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <MoveRight className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
            {model.statuses.map((status) => (
              <DropdownMenuCheckboxItem
                key={status}
                checked={status === task.status}
                onSelect={() => {
                  if (status !== task.status) {
                    onMoveTo(status)
                  }
                }}
              >
                {status}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-muted-foreground">
        {task.priority ? <span className="truncate">{task.priority}</span> : null}
        {task.assignee ? <span className="truncate">{task.assignee}</span> : null}
        {dueDate ? <span className="truncate">{dueDate}</span> : null}
      </div>
      {shownTags.length > 0 ? (
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {shownTags.map((tag) => (
            <Badge key={tag} variant="referenceLabel" className="max-w-full">
              <span className="truncate">{tag}</span>
            </Badge>
          ))}
          {extraTags > 0 ? (
            <Badge variant="referenceLabel">
              {translate('auto.components.task.page.dart.DartBoardCard.moreTags', '+{{count}}', {
                count: extraTags
              })}
            </Badge>
          ) : null}
        </div>
      ) : null}
      <DartCardMarkers info={info} />
      {writes.notice ? (
        // Notice buttons must not open the task.
        <div onClick={(event) => event.stopPropagation()}>
          <DartTaskDetailNotice
            className="flex-col"
            notice={writes.notice}
            dismissNotice={() => dismissDartTaskNotice(identity)}
            recheckNotice={() => recheckDartTaskNotice(identity)}
          />
        </div>
      ) : null}
    </div>
  )
}
