import { useCallback, useMemo, useState } from 'react'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import type { TaskPageData } from '@/store/slices/ui/ui-slice-contract-core'

type OpenTaskPage = (data?: TaskPageData, options?: { recordTasksInteraction?: boolean }) => void

// Dart detail state lives in pageData alone, so Back/forward replay restores it without local copies.
export function useTaskPageDartDetailRouting(args: {
  pageData: TaskPageData
  dartTaskSourceContext: TaskSourceContext | null
  openTaskPage: OpenTaskPage
}) {
  const { pageData, dartTaskSourceContext, openTaskPage } = args
  const selectedDartTask: DartTask | null = pageData.openDartTask ?? null
  const dartDetailSourceContext = useMemo(
    () =>
      selectedDartTask && pageData.openDartSourceContext?.provider === 'dart'
        ? pageData.openDartSourceContext
        : dartTaskSourceContext,
    [dartTaskSourceContext, pageData.openDartSourceContext, selectedDartTask]
  )
  const openDartDetailPage = useCallback(
    (task: DartTask, sourceContext?: TaskSourceContext | null) => {
      openTaskPage(
        {
          taskSource: 'dart',
          openDartTask: task,
          // A detail opening a related task keeps its own host's scope, not the page's.
          openDartSourceContext:
            sourceContext?.provider === 'dart' ? sourceContext : dartTaskSourceContext
        },
        { recordTasksInteraction: false }
      )
    },
    [dartTaskSourceContext, openTaskPage]
  )
  const [dartConnectOpen, setDartConnectOpen] = useState(false)
  return {
    selectedDartTask,
    dartDetailSourceContext,
    openDartDetailPage,
    dartConnectOpen,
    setDartConnectOpen
  }
}
