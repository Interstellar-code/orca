import type { DartTask } from '../../../../../shared/dart/dart-types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getDartStatusTone } from './task-page-dart-list-model'

export function DartRelatedTaskButton({
  task,
  onOpen,
  className
}: {
  task: DartTask
  onOpen: (task: DartTask) => void
  className?: string
}): React.JSX.Element {
  const status = task.status ?? '—'
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn('min-w-0 flex-1 justify-start', className)}
      onClick={() => onOpen(task)}
    >
      <span className="min-w-0 truncate">{task.title}</span>
      <span
        className={cn(
          'inline-flex max-w-28 flex-none items-center rounded-full border px-1.5 py-0.5 text-2xs font-medium',
          getDartStatusTone(task.status)
        )}
      >
        <span className="truncate">{status}</span>
      </span>
    </Button>
  )
}
