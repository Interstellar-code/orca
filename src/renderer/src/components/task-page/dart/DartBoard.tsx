import { translate } from '@/i18n/i18n'
import type { DartBoardProps } from './dart-board-contracts'

/** Placeholder until the real board lands: columns with their cards as plain open buttons. */
export function DartBoard({ model, selectedTaskId }: DartBoardProps): React.JSX.Element {
  return (
    <div data-dart-board className="flex gap-3 overflow-x-auto p-3">
      {model.columns.map((column) => (
        <section
          key={column.key}
          aria-label={column.status}
          className="flex w-72 shrink-0 flex-col gap-2 rounded-md border border-border/50 bg-muted/35 p-2"
        >
          <h3 className="text-xs font-medium text-foreground">
            {column.status ||
              translate('auto.components.task.page.dart.DartBoard.noStatus', 'No status')}{' '}
            <span className="text-muted-foreground">{column.count}</span>
          </h3>
          {column.tasks.map((task) => (
            <button
              key={task.id}
              type="button"
              aria-current={task.id === selectedTaskId}
              className="rounded-md border border-border/50 bg-background px-2 py-1.5 text-left text-sm"
              onClick={() => model.onOpenTask(task)}
            >
              {task.title}
            </button>
          ))}
        </section>
      ))}
    </div>
  )
}
