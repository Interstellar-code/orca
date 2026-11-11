import { Badge } from '@/components/ui/badge'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { DartBoardColumn as DartBoardColumnData } from './dart-board-contracts'

export function dartColumnLabel(column: DartBoardColumnData): string {
  return (
    column.status ||
    translate('auto.components.task.page.dart.DartBoardColumn.noStatus', 'No status')
  )
}

type DartBoardColumnProps = {
  column: DartBoardColumnData
  /** Outlines the column as the drop target while a card hovers over it. */
  dropTarget: boolean
  onDragOver(event: React.DragEvent<HTMLElement>): void
  onDrop(event: React.DragEvent<HTMLElement>): void
  children: React.ReactNode
}

export function DartBoardColumn({
  column,
  dropTarget,
  onDragOver,
  onDrop,
  children
}: DartBoardColumnProps): React.JSX.Element {
  const label = dartColumnLabel(column)
  return (
    <section
      role="group"
      aria-label={translate(
        'auto.components.task.page.dart.DartBoardColumn.groupLabel',
        '{{status}}, {{count}}',
        { status: label, count: column.count }
      )}
      data-dart-column={column.key}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        'w-72 shrink-0 rounded-md border border-border/50 bg-muted/20 motion-reduce:transition-none',
        dropTarget && 'border-ring/70 ring-1 ring-ring/70'
      )}
    >
      <div className="flex h-9 items-center justify-between border-b border-border/50 px-3">
        <Badge variant="secondary">
          <span className="truncate">{label}</span>
        </Badge>
        <span className="text-2xs text-muted-foreground">{column.count}</span>
      </div>
      <div className="min-h-16 space-y-2 p-2">
        {column.tasks.length === 0 ? (
          <div className="flex h-12 items-center justify-center rounded-md border border-dashed border-border/50 text-2xs text-muted-foreground">
            {translate('auto.components.task.page.dart.DartBoardColumn.noTasks', 'No tasks')}
          </div>
        ) : null}
        {children}
      </div>
    </section>
  )
}
