import { useCallback, useEffect, useRef, useState } from 'react'

/** One prompt at a time; every caller gets its answer, and an unmount answers no, so Close never hangs. */
export function useDartDescriptionDiscardPrompt() {
  const [open, setOpen] = useState(false)
  const pendingRef = useRef<{
    promise: Promise<boolean>
    resolve: (allowed: boolean) => void
  } | null>(null)

  const settle = useCallback((allowed: boolean) => {
    pendingRef.current?.resolve(allowed)
    pendingRef.current = null
    setOpen(false)
  }, [])

  const ask = useCallback((): Promise<boolean> => {
    if (pendingRef.current) {
      return pendingRef.current.promise
    }
    let resolve: (allowed: boolean) => void = () => {}
    const promise = new Promise<boolean>((done) => (resolve = done))
    pendingRef.current = { promise, resolve }
    setOpen(true)
    return promise
  }, [])

  useEffect(
    () => () => {
      pendingRef.current?.resolve(false)
      pendingRef.current = null
    },
    []
  )

  return { open, ask, settle }
}
