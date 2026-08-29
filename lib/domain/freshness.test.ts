import { describe, it, expect } from 'vitest'
import {
  AGING_MS,
  FRESH_MS,
  ageMs,
  freshnessOf,
  shouldDeferToOfficialSources,
} from './freshness'

const at = (ms: number) => new Date(ms)

describe('freshnessOf', () => {
  it('reports unavailable when nothing has ever been fetched', () => {
    expect(freshnessOf(null, at(1_000_000))).toBe('unavailable')
  })

  it('reports fresh immediately after a fetch', () => {
    expect(freshnessOf(at(1_000_000), at(1_000_000))).toBe('fresh')
  })

  it('stays fresh just under the threshold and ages just over it', () => {
    const t0 = 1_000_000
    expect(freshnessOf(at(t0), at(t0 + FRESH_MS - 1))).toBe('fresh')
    expect(freshnessOf(at(t0), at(t0 + FRESH_MS))).toBe('aging')
  })

  it('stays aging just under the threshold and goes stale just over it', () => {
    const t0 = 1_000_000
    expect(freshnessOf(at(t0), at(t0 + AGING_MS - 1))).toBe('aging')
    expect(freshnessOf(at(t0), at(t0 + AGING_MS))).toBe('stale')
  })

  it('treats a future timestamp as fresh rather than as an error', () => {
    expect(freshnessOf(at(2_000_000), at(1_000_000))).toBe('fresh')
  })

  it('does not go stale merely because the RSS ttl of 60 minutes has passed', () => {
    // The point of the grading: a 60-minute publisher ttl is not a promise,
    // so we mark data stale long before it, at 15 minutes.
    const t0 = 1_000_000
    expect(freshnessOf(at(t0), at(t0 + 16 * 60_000))).toBe('stale')
  })
})

describe('ageMs', () => {
  it('returns null when nothing has been fetched', () => {
    expect(ageMs(null)).toBeNull()
  })

  it('returns the elapsed time, never negative', () => {
    expect(ageMs(at(1_000), at(4_000))).toBe(3_000)
    expect(ageMs(at(4_000), at(1_000))).toBe(0)
  })
})

describe('shouldDeferToOfficialSources', () => {
  it('defers once data is stale or unavailable, not before', () => {
    expect(shouldDeferToOfficialSources('fresh')).toBe(false)
    expect(shouldDeferToOfficialSources('aging')).toBe(false)
    expect(shouldDeferToOfficialSources('stale')).toBe(true)
    expect(shouldDeferToOfficialSources('unavailable')).toBe(true)
  })
})
