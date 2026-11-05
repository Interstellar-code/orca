import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import { translate } from '@/i18n/i18n'
import { dartSupportsWritesV2ForTarget } from '@/runtime/runtime-dart-write-client'
import type { DartReadScope } from '@/store/slices/dart/dart-read-coordination'
import { useAppStore } from '@/store'
import type { DartCreateDraft } from './dart-detail-contracts'

export function useDartCreateCapabilities(
  taskSource: string | undefined,
  dartConnected: boolean,
  scope: DartReadScope
): { createSupportsWritesV2: boolean; createWritesV2Pending: boolean } {
  const [writesV2, setWritesV2] = useState<{ contextKey: string; supported: boolean } | null>(null)
  const createSupportsWritesV2 = writesV2?.contextKey === scope.contextKey && writesV2.supported
  const createWritesV2Pending =
    taskSource === 'dart' && dartConnected && writesV2?.contextKey !== scope.contextKey
  useEffect(() => {
    let cancelled = false
    setWritesV2(null)
    if (taskSource === 'dart' && dartConnected) {
      void dartSupportsWritesV2ForTarget(scope.target)
        .then((supported) => {
          if (!cancelled) {
            setWritesV2({ contextKey: scope.contextKey, supported })
          }
        })
        .catch(() => {
          if (!cancelled) {
            setWritesV2({ contextKey: scope.contextKey, supported: false })
          }
        })
    }
    return () => {
      cancelled = true
    }
  }, [dartConnected, taskSource, scope])
  return { createSupportsWritesV2, createWritesV2Pending }
}

export function useDartCreateOpenKey(
  key: string,
  hostKey: string,
  ownerUserId: string | null | undefined,
  unknownKey: string
): [string | null, Dispatch<SetStateAction<string | null>>] {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const previousOwner = useRef<{ hostKey: string; ownerUserId: string | null }>({
    hostKey,
    ownerUserId: ownerUserId ?? null
  })
  useEffect(() => {
    const previous = previousOwner.current
    const accountChanged =
      previous.hostKey === hostKey &&
      Boolean(previous.ownerUserId && ownerUserId && previous.ownerUserId !== ownerUserId)
    previousOwner.current = {
      hostKey,
      ownerUserId: ownerUserId ?? (previous.hostKey === hostKey ? previous.ownerUserId : null)
    }
    setOpenKey((current) => {
      if (accountChanged) {
        return null
      }
      if (current === key) {
        return current
      }
      return current &&
        JSON.parse(current)[0] === hostKey &&
        (!ownerUserId || current === unknownKey)
        ? key
        : null
    })
  }, [hostKey, key, ownerUserId, unknownKey])
  return [openKey, setOpenKey]
}

export function useDartCreateMounted(): RefObject<boolean> {
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  return mounted
}

export function useDartCreateDraft(
  key: string,
  draft: DartCreateDraft,
  filteredBoard: string | null | undefined,
  boards: string[] | undefined
): { createDraft: DartCreateDraft; setCreateDraft(patch: Partial<DartCreateDraft>): void } {
  const patchSession = useAppStore((state) => state.patchDartCreateSession)
  const createDraft = useMemo(() => {
    const board = filteredBoard ?? boards?.[0] ?? ''
    return draft.dartboard || !board ? draft : { ...draft, dartboard: board }
  }, [boards, filteredBoard, draft])
  const setCreateDraft = useCallback(
    (patch: Partial<DartCreateDraft>): void => {
      const current = useAppStore.getState().dartCreateSessions[key]?.draft ?? createDraft
      patchSession(key, {
        draft: { ...current, dartboard: current.dartboard || createDraft.dartboard, ...patch }
      })
    },
    [createDraft, key, patchSession]
  )
  return { createDraft, setCreateDraft }
}

export function useDartCreateOpen(
  key: string,
  draft: DartCreateDraft,
  setDraft: (patch: Partial<DartCreateDraft>) => void,
  setOpenKey: Dispatch<SetStateAction<string | null>>,
  connected: boolean,
  updateRequired: boolean,
  mine: boolean | undefined,
  ownerUserId: string | null,
  viewerName: string | null | undefined
): () => void {
  return useCallback((): void => {
    if (!connected || updateRequired) {
      return
    }
    setDraft({
      dartboard: draft.dartboard,
      assignee: draft.assignee || (mine && ownerUserId ? (viewerName ?? '') : '')
    })
    setOpenKey(key)
  }, [connected, draft, key, mine, ownerUserId, setDraft, setOpenKey, updateRequired, viewerName])
}

export function useDartCreateDiscardActions(
  key: string,
  hasCurrentViewer: () => boolean,
  setOpenKey: Dispatch<SetStateAction<string | null>>,
  openDartDetailPage: (task: DartTask) => void
): { claimCreateMatch(task: DartTask): void; discardCreateDraft(): void } {
  const clearSession = useAppStore((state) => state.clearDartCreateSession)
  const claimCreateMatch = useCallback(
    (task: DartTask): void => {
      if (!hasCurrentViewer() || useAppStore.getState().dartCreateSessions[key]?.submitting) {
        return
      }
      clearSession(key)
      setOpenKey(null)
      openDartDetailPage(task)
    },
    [clearSession, hasCurrentViewer, key, openDartDetailPage, setOpenKey]
  )
  const discardCreateDraft = useCallback((): void => {
    if (!hasCurrentViewer() || useAppStore.getState().dartCreateSessions[key]?.submitting) {
      return
    }
    clearSession(key)
    setOpenKey(null)
  }, [clearSession, hasCurrentViewer, key, setOpenKey])
  return { claimCreateMatch, discardCreateDraft }
}

export function useDartCreateAccountCheck(): {
  retryAccountCheck(): Promise<void>
  accountCheckNotice: { kind: 'unknown'; message: string }
} {
  const checkDartConnection = useAppStore((state) => state.checkDartConnection)
  const retryAccountCheck = useCallback(async (): Promise<void> => {
    await checkDartConnection()
  }, [checkDartConnection])
  return {
    retryAccountCheck,
    accountCheckNotice: {
      kind: 'unknown',
      message: translate(
        'auto.components.task.page.dart.TaskCreateDialog.checkingAccount',
        'Checking your Dart account'
      )
    }
  }
}
