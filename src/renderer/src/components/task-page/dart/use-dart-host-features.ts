import { useEffect, useState } from 'react'
import type { DartHostFeatures } from '../../../../../shared/dart/dart-types'
import type { RuntimeClientTarget } from '../../../../../shared/runtime-client-target'
import { dartBoardFeaturesForTarget } from '@/runtime/runtime-dart-client'

/** D1.3: probed on mount and on every target change, never cached. */
export function useDartHostFeatures(args: {
  active: boolean
  hostKey: string
  target: RuntimeClientTarget
}): { featuresReady: boolean; hostFeatures: DartHostFeatures | null } {
  const { active, hostKey, target } = args
  const [probed, setProbed] = useState<{ hostKey: string; features: DartHostFeatures } | null>(null)
  useEffect(() => {
    if (!active) {
      return
    }
    let cancelled = false
    void dartBoardFeaturesForTarget(target).then((features) => {
      if (!cancelled) {
        // A bridge that answers nothing counts as no board.
        setProbed({ hostKey, features: { board: features?.board === true } })
      }
    })
    return () => {
      cancelled = true
    }
  }, [active, hostKey, target])
  const ready = probed !== null && probed.hostKey === hostKey
  return { featuresReady: ready, hostFeatures: ready ? probed.features : null }
}
