/* eslint-disable max-lines -- Why: one hook keeps the owner guard, the load and every mutation together so stale replies are dropped in one place. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  normalizeDartSavedViewState,
  type DartBoardFilters,
  type DartLayout,
  type DartSavedView,
  type DartSavedViewMutation,
  type DartSavedViewState
} from '../../../../../shared/dart/dart-saved-views'
import { createNonSecureContextUuid } from '../../../../../shared/non-secure-context-uuid'
import type { RuntimeClientTarget } from '../../../../../shared/runtime-client-target'
import { translate } from '@/i18n/i18n'
import {
  mutateDartSavedViews,
  readDartSavedViewState
} from '@/runtime/runtime-dart-saved-view-state'
import type { DartSavedViewsModel } from './dart-board-contracts'

type DartViewSnapshotValue = {
  filters: DartBoardFilters
  layout: DartLayout
  showEmptyColumns: boolean
}

type SavedViewsOwner = { targetKey: string; active: boolean }
type SavedViewsLifetime = {
  owner: SavedViewsOwner
  pending: boolean
  reading: boolean
  state: DartSavedViewState | null
}
type SavedViewsSnapshot = {
  owner: SavedViewsOwner | null
  state: DartSavedViewState
  supported: boolean
}
type SendMutation = (mutation: DartSavedViewMutation) => Promise<DartSavedViewState | null>

const EMPTY_STATE: DartSavedViewState = { views: [], activeViewId: null }
const FILTER_KEYS = [
  'mine',
  'status',
  'dartboard',
  'search',
  'tag',
  'priority',
  'onHold'
] as const satisfies readonly (keyof DartBoardFilters)[]

export function isDartSavedViewModified(
  view: DartSavedView,
  current: DartViewSnapshotValue
): boolean {
  return (
    view.layout !== current.layout ||
    view.showEmptyColumns !== current.showEmptyColumns ||
    FILTER_KEYS.some((key) => view.filters[key] !== current.filters[key])
  )
}

function refusalMessage(): string {
  return translate(
    'auto.components.task.page.dart.TaskPageDartSavedViews.refused',
    'The host did not accept this change. The name may already be used by another view.'
  )
}

export function useTaskPageDartSavedViews(args: {
  active: boolean
  target: RuntimeClientTarget
  current: DartViewSnapshotValue
  applyView(view: DartSavedView | null): void
}): DartSavedViewsModel {
  const { active, current } = args
  const environmentId = args.target.kind === 'environment' ? args.target.environmentId : null
  const target = useMemo<RuntimeClientTarget>(
    () => (environmentId === null ? { kind: 'local' } : { kind: 'environment', environmentId }),
    [environmentId]
  )
  const targetKey = environmentId === null ? 'local' : `environment:${environmentId}`
  const owner = useMemo<SavedViewsOwner>(() => ({ targetKey, active }), [targetKey, active])
  const [snapshot, setSnapshot] = useState<SavedViewsSnapshot>({
    owner: null,
    state: EMPTY_STATE,
    supported: true
  })
  const [loadError, setLoadError] = useState<{ owner: SavedViewsOwner; message: string } | null>(
    null
  )
  const [readingOwner, setReadingOwner] = useState<SavedViewsOwner | null>(null)
  const [pendingLifetime, setPendingLifetime] = useState<SavedViewsLifetime | null>(null)
  const [refresh, setRefresh] = useState(0)
  const lifetimeRef = useRef<SavedViewsLifetime | null>(null)
  const applyViewRef = useRef(args.applyView)
  const currentRef = useRef(current)
  useLayoutEffect(() => {
    applyViewRef.current = args.applyView
    currentRef.current = current
  })

  useLayoutEffect(() => {
    if (!owner.active) {
      lifetimeRef.current = null
      return
    }
    const lifetime: SavedViewsLifetime = { owner, pending: false, reading: true, state: null }
    lifetimeRef.current = lifetime
    return () => {
      if (lifetimeRef.current === lifetime) {
        lifetimeRef.current = null
      }
    }
  }, [owner])

  useEffect(() => {
    const lifetime = lifetimeRef.current
    if (!lifetime || lifetime.owner !== owner) {
      return
    }
    let cancelled = false
    lifetime.reading = true
    setReadingOwner(owner)
    setLoadError(null)
    const load = async (): Promise<void> => {
      try {
        const result = await readDartSavedViewState(target)
        if (cancelled || lifetimeRef.current !== lifetime) {
          return
        }
        const state = result.supported ? result.state : EMPTY_STATE
        lifetime.state = state
        setSnapshot({ owner, state, supported: result.supported })
        const view = state.views.find((item) => item.id === state.activeViewId)
        if (view) {
          applyViewRef.current(view)
        }
      } catch (reason) {
        if (!cancelled && lifetimeRef.current === lifetime) {
          setLoadError({
            owner,
            message:
              reason instanceof Error
                ? reason.message
                : translate(
                    'auto.components.task.page.dart.TaskPageDartSavedViews.loadFailed',
                    'Could not load saved views.'
                  )
          })
        }
      } finally {
        if (!cancelled && lifetimeRef.current === lifetime) {
          lifetime.reading = false
          setReadingOwner(null)
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [owner, target, refresh])

  const loaded = snapshot.owner === owner
  const state = loaded ? snapshot.state : EMPTY_STATE
  const supported = loaded ? snapshot.supported : true
  const pending = pendingLifetime?.owner === owner
  const activeView = state.views.find((view) => view.id === state.activeViewId) ?? null
  const modified = activeView ? isDartSavedViewModified(activeView, current) : false

  const run = async (job: (send: SendMutation) => Promise<boolean>): Promise<boolean> => {
    const lifetime = lifetimeRef.current
    if (
      !loaded ||
      !supported ||
      !lifetime ||
      lifetime.owner !== owner ||
      !lifetime.state ||
      lifetime.pending ||
      lifetime.reading
    ) {
      return false
    }
    lifetime.pending = true
    setPendingLifetime(lifetime)
    const send: SendMutation = async (mutation) => {
      const result = await mutateDartSavedViews(target, mutation)
      if (lifetimeRef.current !== lifetime) {
        return null
      }
      if (!result.supported) {
        lifetime.state = EMPTY_STATE
        setSnapshot({ owner, state: EMPTY_STATE, supported: false })
        return null
      }
      lifetime.state = result.state
      setSnapshot({ owner, state: result.state, supported: true })
      return result.state
    }
    try {
      return await job(send)
    } catch (reason) {
      if (lifetimeRef.current === lifetime) {
        toast.error(
          reason instanceof Error
            ? reason.message
            : translate(
                'auto.components.task.page.dart.TaskPageDartSavedViews.saveFailed',
                'Could not save views.'
              )
        )
      }
      return false
    } finally {
      lifetime.pending = false
      if (lifetimeRef.current === lifetime) {
        setPendingLifetime(null)
      }
    }
  }

  // Why: the host answers a refused change with the unchanged state, so acceptance is read from the reply.
  const saveView = async (send: SendMutation, view: DartSavedView): Promise<boolean> => {
    const expected = normalizeDartSavedViewState({ views: [view], activeViewId: null }).views[0]
    if (!expected) {
      toast.error(refusalMessage())
      return false
    }
    const next = await send({ kind: 'save', view: expected })
    if (!next) {
      return false
    }
    const stored = next.views.find((item) => item.id === expected.id)
    if (!stored || stored.name !== expected.name || isDartSavedViewModified(stored, expected)) {
      toast.error(refusalMessage())
      return false
    }
    return true
  }

  return {
    views: state.views,
    activeViewId: state.activeViewId,
    modified,
    load: {
      state: !active
        ? 'idle'
        : loadError?.owner === owner
          ? 'error'
          : loaded && readingOwner !== owner
            ? 'ready'
            : 'loading',
      data: null,
      error: loadError?.owner === owner ? loadError.message : null,
      retry: () => {
        if (lifetimeRef.current?.pending) {
          return
        }
        if (lifetimeRef.current) {
          lifetimeRef.current.reading = true
        }
        setRefresh((value) => value + 1)
      }
    },
    pending,
    supported,
    apply: (id) =>
      run(async (send) => {
        const next = await send({ kind: 'select', id })
        if (!next) {
          return false
        }
        if (id === null) {
          applyViewRef.current(null)
          return true
        }
        const view = next.views.find((item) => item.id === id)
        if (!view || next.activeViewId !== id) {
          return false
        }
        applyViewRef.current(view)
        return true
      }),
    saveCurrent: () =>
      run(async (send) => {
        return activeView ? saveView(send, { ...activeView, ...currentRef.current }) : false
      }),
    saveAsNew: (name) =>
      run(async (send) => {
        const id = createNonSecureContextUuid()
        const saved = await saveView(send, { id, name: name.trim(), ...currentRef.current })
        if (!saved) {
          return false
        }
        const next = await send({ kind: 'select', id })
        return next?.activeViewId === id
      }),
    rename: (id, name) =>
      run(async (send) => {
        const trimmed = name.trim()
        const next = await send({ kind: 'rename', id, name: trimmed })
        if (!next) {
          return false
        }
        if (next.views.find((item) => item.id === id)?.name !== trimmed) {
          toast.error(refusalMessage())
          return false
        }
        return true
      }),
    remove: (id) =>
      run(async (send) => {
        const next = await send({ kind: 'delete', id })
        return next !== null && !next.views.some((item) => item.id === id)
      })
  }
}
