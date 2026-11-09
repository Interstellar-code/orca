import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { taskProviderErrorMessage } from '@/lib/task-provider-error-copy'
import { getDartReadScope } from '@/store/slices/dart/dart-read-coordination'
import { buildDartWorkspaceSource } from '../../../../shared/new-workspace/workspace-source'
import { DART_APP_HOST, type DartTask } from '../../../../shared/dart/dart-types'
import { parseDartTaskUrl } from '../../../../shared/dart/dart-issue-url'
import {
  getTaskSourceCacheScope,
  type TaskSourceContext
} from '../../../../shared/task-source-context'
import type { WorkspaceAttachment } from '../../../../shared/worktree/types'

const LOOKUP_DEBOUNCE_MS = 200

export type DartAttachmentUrlSource = {
  /** The pasted text is a link on Dart's own host, task link or not. */
  intent: boolean
  /** A Dart host link that is not a task link. */
  invalidTaskUrl: boolean
  loading: boolean
  task: DartTask | null
  attachment: WorkspaceAttachment | null
  /** Display-ready failure text for the pasted task. */
  error: string | null
  retry: () => void
}

type Lookup = {
  requestKey: string
  task: DartTask | null
  error: string | null
}

function isDartHostUrl(value: string): boolean {
  try {
    const url = new URL(value.trim())
    const host = url.hostname.toLowerCase()
    return (
      url.protocol === 'https:' &&
      (host === DART_APP_HOST || host === 'dartai.com' || host.endsWith('.dartai.com'))
    )
  } catch {
    return false
  }
}

export function toDartTaskAttachment(
  task: Pick<DartTask, 'id' | 'title' | 'htmlUrl'>,
  sourceContext: TaskSourceContext | null
): WorkspaceAttachment {
  return {
    ...buildDartWorkspaceSource(task),
    identifier: task.id,
    ...(sourceContext ? { taskSourceContext: sourceContext } : {})
  }
}

export function useDartAttachmentUrlSource(args: {
  value: string
  sourceContext: TaskSourceContext | null
}): DartAttachmentUrlSource {
  const fetchDartTask = useAppStore((state) => state.fetchDartTask)
  const { value, sourceContext } = args
  const intent = useMemo(() => isDartHostUrl(value), [value])
  const parsed = useMemo(() => (intent ? parseDartTaskUrl(value) : null), [intent, value])
  const [retryGeneration, setRetryGeneration] = useState(0)
  const [lookup, setLookup] = useState<Lookup | null>(null)
  const generationRef = useRef(0)
  const scope = sourceContext ? getTaskSourceCacheScope(sourceContext) : ''
  const requestKey = parsed ? `${parsed.taskId}::${scope}::${retryGeneration}` : null

  useEffect(() => {
    const generation = (generationRef.current += 1)
    if (!parsed || !requestKey) {
      return
    }
    const taskId = parsed.taskId
    // A row without a source context reads on the host active now, not the one active when the timer fires.
    const pinnedScope = sourceContext ? null : getDartReadScope(useAppStore.getState().settings)
    const timer = setTimeout(() => {
      void fetchDartTask(taskId, {
        sourceContext,
        force: retryGeneration > 0,
        ...(pinnedScope ? { scope: pinnedScope } : {})
      })
        .then((result) => {
          if (generationRef.current !== generation) {
            return
          }
          if (result.ok && result.task.id === taskId) {
            setLookup({ requestKey, task: result.task, error: null })
            return
          }
          setLookup({
            requestKey,
            task: null,
            error: result.ok
              ? taskProviderErrorMessage({ errorCode: 'dart.taskNotFound' })
              : taskProviderErrorMessage(result)
          })
        })
        .catch((error: unknown) => {
          if (generationRef.current === generation) {
            setLookup({
              requestKey,
              task: null,
              error: taskProviderErrorMessage({
                error: error instanceof Error ? error.message : ''
              })
            })
          }
        })
    }, LOOKUP_DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // sourceContext identity is covered by requestKey's scope.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchDartTask, parsed, requestKey])

  const retry = useCallback(() => setRetryGeneration((generation) => generation + 1), [])
  const settled = lookup && lookup.requestKey === requestKey ? lookup : null
  return {
    intent,
    invalidTaskUrl: intent && !parsed,
    loading: Boolean(parsed) && !settled,
    task: settled?.task ?? null,
    attachment: settled?.task ? toDartTaskAttachment(settled.task, sourceContext) : null,
    error: settled?.error ?? null,
    retry
  }
}
