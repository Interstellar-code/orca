import { useMemo, useRef } from 'react'
import { DART_ON_HOLD_READ_CAP } from '@/store/slices/dart/dart-on-hold-relationship-actions'

/** Reads the next batch of unchecked tasks: untried first, then retries least-recently-attempted first, so failures cycle instead of starving the rest. */
export function useDartOnHoldCheckMore(args: {
  unchecked: readonly string[] | undefined
  errored: ReadonlySet<string> | undefined
  publication: string
  read(taskIds: string[]): Promise<void>
}): (() => void) | undefined {
  const { unchecked, errored, publication, read } = args
  const attempts = useRef({ publication: '', sequence: 0, lastById: new Map<string, number>() })
  return useMemo(
    () =>
      unchecked && errored
        ? (): void => {
            if (attempts.current.publication !== publication) {
              attempts.current = { publication, sequence: 0, lastById: new Map() }
            }
            const { lastById } = attempts.current
            const isRetry = (id: string): boolean => lastById.has(id) || errored.has(id)
            // Array.sort is stable, so never-attempted retries (errored by the automatic read) keep read order.
            const retries = unchecked
              .filter(isRetry)
              .sort((a, b) => (lastById.get(a) ?? -1) - (lastById.get(b) ?? -1))
            const batch = [...unchecked.filter((id) => !isRetry(id)), ...retries].slice(
              0,
              DART_ON_HOLD_READ_CAP
            )
            for (const id of batch) {
              attempts.current.sequence += 1
              lastById.set(id, attempts.current.sequence)
            }
            void read(batch)
          }
        : undefined,
    [unchecked, errored, publication, read]
  )
}
