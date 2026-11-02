import { useCallback, useEffect, useState } from 'react'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import { taskProviderErrorMessage, taskProviderErrorText } from '@/lib/task-provider-error-copy'
import { useAppStore } from '@/store'
import type { DartCommentsView, DartDetailLoadState } from './TaskDetailView'

const LOADING_STATE = { status: 'loading' } as const

export function useDartTaskDetailData(
  task: DartTask | null,
  sourceContext: TaskSourceContext | null
) {
  const fetchDartTask = useAppStore((s) => s.fetchDartTask)
  const listDartComments = useAppStore((s) => s.listDartComments)
  const [full, setFull] = useState<DartDetailLoadState<DartTask>>({
    status: 'loading'
  })
  const [comments, setComments] = useState<DartDetailLoadState<DartCommentsView>>({
    status: 'loading'
  })
  const [reloadNonce, setReloadNonce] = useState(0)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const taskId = task?.id ?? null
  useEffect(() => {
    if (!taskId) {
      return
    }
    let cancelled = false
    const force = reloadNonce > 0
    setLoadedFor(taskId)
    setFull({ status: 'loading' })
    setComments({ status: 'loading' })
    void fetchDartTask(taskId, { sourceContext, force })
      .then((result) => {
        if (cancelled) {
          return
        }
        setFull(
          result.ok
            ? { status: 'ready', value: result.task }
            : { status: 'error', message: taskProviderErrorMessage(result) }
        )
      })
      .catch(() => {
        if (!cancelled) {
          setFull({
            status: 'error',
            message: taskProviderErrorText(undefined, 'dart.loadFailed')
          })
        }
      })
    void listDartComments(taskId, { sourceContext, force })
      .then((result) => {
        if (cancelled) {
          return
        }
        setComments(
          result.ok
            ? {
                status: 'ready',
                value: {
                  comments: result.comments,
                  totalCount: result.totalCount
                }
              }
            : { status: 'error', message: taskProviderErrorMessage(result) }
        )
      })
      .catch(() => {
        if (!cancelled) {
          setComments({
            status: 'error',
            message: taskProviderErrorText(undefined, 'dart.loadFailed')
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [taskId, sourceContext, reloadNonce, fetchDartTask, listDartComments])
  const retry = useCallback(() => setReloadNonce((n) => n + 1), [])
  // Until the effect runs for a newly opened task, the previous task's state must not show.
  const isCurrent = loadedFor === taskId
  return {
    full: isCurrent ? full : LOADING_STATE,
    comments: isCurrent ? comments : LOADING_STATE,
    retry
  }
}
