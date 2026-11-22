import { useEffect, useRef, useState } from 'react'
import type { DartWorkspaceConfig } from '../../../../../shared/dart/dart-types'
import { translate } from '@/i18n/i18n'
import { taskProviderErrorMessage } from '@/lib/work-items/task-provider-error-copy'
import type { DartClientResult } from '@/runtime/runtime-dart-client'

type FetchDartConfig = (options?: {
  force?: boolean
}) => Promise<DartClientResult<{ config: DartWorkspaceConfig }>>

/** The workspace config of the page's account; it reads as null while another account's config is loading. */
export function useDartWorkspaceConfig(args: {
  active: boolean
  refreshNonce: number
  hostKey: string
  accountViewerId: string | null
  fetchDartConfig: FetchDartConfig
}): { dartConfig: DartWorkspaceConfig | null; dartConfigError: string | null } {
  const { active, refreshNonce, hostKey, accountViewerId, fetchDartConfig } = args
  const [loaded, setLoaded] = useState<{
    ownerKey: string
    config: DartWorkspaceConfig
  } | null>(null)
  const ownerKey = JSON.stringify([hostKey, accountViewerId])
  // The account whose read last started, and that read's error.
  const [read, setRead] = useState<{ ownerKey: string; error: string | null }>({
    ownerKey,
    error: null
  })
  const fetchRef = useRef(fetchDartConfig)
  useEffect(() => {
    fetchRef.current = fetchDartConfig
  })
  const isCurrent = read.ownerKey === ownerKey

  useEffect(() => {
    if (!active) {
      return
    }
    let cancelled = false
    setRead((prev) =>
      prev.ownerKey === ownerKey && prev.error === null ? prev : { ownerKey, error: null }
    )
    void fetchRef
      .current({ force: refreshNonce > 0 })
      .then((result) => {
        if (cancelled) {
          return
        }
        if (result.ok) {
          setLoaded({ ownerKey, config: result.config })
        } else {
          setRead({ ownerKey, error: taskProviderErrorMessage(result) })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRead({
            ownerKey,
            error: translate(
              'auto.components.task.page.dart.TaskCreateDialog.configFailed',
              'Could not load Dart configuration.'
            )
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [active, refreshNonce, accountViewerId, ownerKey])

  // A refresh keeps the last config of the same account on screen while it refetches.
  const shown = isCurrent && accountViewerId
  const config = loaded?.ownerKey === ownerKey ? loaded.config : null
  return { dartConfig: shown ? config : null, dartConfigError: shown ? read.error : null }
}
