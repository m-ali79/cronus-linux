/**
 * Tests for tracking coordinator stabilization period.
 */
import { expect, test } from 'bun:test'
import type { ActiveWindowDetails } from 'shared'
import { createStabilizingWrapper } from './trackingCoordinator'

const TRACKER_STABILIZATION_PERIOD_MS = 10000

const stubDetails = (
  overrides: Partial<ActiveWindowDetails> = {}
): ActiveWindowDetails =>
  ({
    ownerName: 'Test',
    type: 'window',
    title: 'T',
    timestamp: Date.now(),
    ...overrides
  }) as ActiveWindowDetails

test('wrapper does not call callback when elapsed < TRACKER_STABILIZATION_PERIOD_MS', () => {
  const start = Date.now()
  const callback = () => {
    throw new Error('callback should not be called')
  }
  const wrapped = createStabilizingWrapper(start, TRACKER_STABILIZATION_PERIOD_MS, callback)
  wrapped(stubDetails({ timestamp: start }))
})

test('wrapper calls callback when elapsed >= TRACKER_STABILIZATION_PERIOD_MS', () => {
  const start = Date.now() - TRACKER_STABILIZATION_PERIOD_MS - 1
  let called = false
  const callback = () => {
    called = true
  }
  const wrapped = createStabilizingWrapper(start, TRACKER_STABILIZATION_PERIOD_MS, callback)
  wrapped(stubDetails())
  expect(called).toBe(true)
})

test('wrapper calls callback when trackerStartTime is missing (treat as stabilized)', () => {
  let called = false
  const callback = () => {
    called = true
  }
  const wrapped = createStabilizingWrapper(undefined, TRACKER_STABILIZATION_PERIOD_MS, callback)
  wrapped(stubDetails())
  expect(called).toBe(true)
})
