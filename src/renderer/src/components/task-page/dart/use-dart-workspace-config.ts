import { useEffect, useRef, useState } from 'react'
import type { DartWorkspaceConfig } from '../../../../../shared/dart/dart-types'
import { translate } from '@/i18n/i18n'
import { taskProviderErrorMessage } from '@/lib/task-provider-error-copy'
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
  const [config, setConfig] = useState<DartWorkspaceConfig | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)
  const fetchRef = useRef(fetchDartConfig)
  useEffect(() => {
    fetchRef.current = fetchDartConfig
  })
  const ownerKey = JSON.stringify([hostKey, accountViewerId])
  const ownerRef = useRef(ownerKey)
  const isCurrent = ownerRef.current === ownerKey

  useEffect(() => {
    if (!active) {
      return
    }
    let cancelled = false
    ownerRef.current = ownerKey
    setConfigError(null)
    setConfig(null)
    void fetchRef
      .current({ force: refreshNonce > 0 })
      .then((result) => {
        if (cancelled) {
          return
        }
        if (result.ok) {
          setConfig(result.config)
        } else {
          setConfigError(taskProviderErrorMessage(result))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setConfigError(
            translate(
              'auto.components.task.page.dart.TaskCreateDialog.configFailed',
              'Could not load Dart configuration.'
            )
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [active, refreshNonce, accountViewerId, ownerKey])

  const shown = isCurrent && accountViewerId
  return { dartConfig: shown ? config : null, dartConfigError: shown ? configError : null }
}
