import { useMemo, useRef } from 'react'
import { DART_ON_HOLD_READ_CAP } from '@/store/slices/dart/dart-on-hold-relationship-actions'

/** Reads the next batch of unchecked tasks; ones already tried in this publication or errored go behind untried ones, so failures cannot starve the rest. */
export function useDartOnHoldCheckMore(args: {
  unchecked: readonly string[] | undefined
  errored: ReadonlySet<string> | undefined
  publication: string
  read(taskIds: string[]): Promise<void>
}): (() => void) | undefined {
  const { unchecked, errored, publication, read } = args
  const attempted = useRef({ publication: '', ids: new Set<string>() })
  return useMemo(
    () =>
      unchecked && errored
        ? (): void => {
            if (attempted.current.publication !== publication) {
              attempted.current = { publication, ids: new Set() }
            }
            const { ids } = attempted.current
            const isRetry = (id: string): boolean => ids.has(id) || errored.has(id)
            const batch = [
              ...unchecked.filter((id) => !isRetry(id)),
              ...unchecked.filter(isRetry)
            ].slice(0, DART_ON_HOLD_READ_CAP)
            for (const id of batch) {
              ids.add(id)
            }
            void read(batch)
          }
        : undefined,
    [unchecked, errored, publication, read]
  )
}
