import { useEffect, useRef } from 'react'
import { isWindowVisible } from '@/lib/window-visibility-interval'

const REFRESH_AFTER_MS = 2 * 60_000

/** D4.1: no timer; a window that turns visible with data older than 2 minutes refreshes once. */
export function useDartVisibilityRefresh(args: {
  enabled: boolean
  fetchedAt: number
  loading: boolean
  onStale: () => void
}): void {
  const { enabled, fetchedAt, loading, onStale } = args
  const latestRef = useRef({ fetchedAt, loading, onStale })
  useEffect(() => {
    latestRef.current = { fetchedAt, loading, onStale }
  })
  useEffect(() => {
    if (!enabled) {
      return
    }
    const onVisibilityChange = (): void => {
      const latest = latestRef.current
      if (
        isWindowVisible() &&
        !latest.loading &&
        latest.fetchedAt > 0 &&
        Date.now() - latest.fetchedAt > REFRESH_AFTER_MS
      ) {
        latest.onStale()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [enabled])
}
