import { describe, it, expect } from 'vitest'
import { fromSydneyWallTime } from './time'

describe('fromSydneyWallTime', () => {
  it('converts an AEST (winter, UTC+10) wall time to the correct instant', () => {
    // 29 Aug 2026 04:12 Sydney == 28 Aug 2026 18:12 UTC
    const d = fromSydneyWallTime(2026, 8, 29, 4, 12, 0)
    expect(d.toISOString()).toBe('2026-08-28T18:12:00.000Z')
  })

  it('converts an AEDT (summer, UTC+11) wall time to the correct instant', () => {
    // 15 Jan 2026 16:12 Sydney == 15 Jan 2026 05:12 UTC
    const d = fromSydneyWallTime(2026, 1, 15, 16, 12, 0)
    expect(d.toISOString()).toBe('2026-01-15T05:12:00.000Z')
  })

  it('handles midnight without rolling the date', () => {
    // 1 Jul 2026 00:00 Sydney == 30 Jun 2026 14:00 UTC
    const d = fromSydneyWallTime(2026, 7, 1, 0, 0, 0)
    expect(d.toISOString()).toBe('2026-06-30T14:00:00.000Z')
  })
})
