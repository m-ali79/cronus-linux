/**
 * Tracking coordinator: applies stabilization period so events are dropped
 * until TRACKER_STABILIZATION_PERIOD_MS has elapsed after tracking starts.
 */

import type { ActiveWindowDetails } from 'shared'

export const TRACKER_STABILIZATION_PERIOD_MS = 10000

export function createStabilizingWrapper(
  trackerStartTime: number | undefined,
  periodMs: number,
  callback: (details: ActiveWindowDetails | null) => void | Promise<void>
): (details: ActiveWindowDetails | null) => void | Promise<void> {
  return (details: ActiveWindowDetails | null) => {
    if (trackerStartTime !== undefined) {
      const elapsed = Date.now() - trackerStartTime
      if (elapsed < periodMs) return
    }
    return callback(details)
  }
}
