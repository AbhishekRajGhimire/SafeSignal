import { describe, it, expect } from 'vitest'
import { toWire, fromWire, isSurfaceable, SEVERITY, type Warning } from './warning'

const sample: Warning = {
  id: 'incident-1',
  level: 'advice',
  title: 'ALTINIER RD, TUNCESTER',
  location: 'ALTINIER RD, TUNCESTER 2480',
  council: 'Lismore',
  status: 'Under control',
  type: 'Grass Fire',
  sizeHa: 0,
  agency: 'Rural Fire Service',
  updatedAt: new Date('2026-08-29T04:12:00.000Z'),
  publishedAt: new Date('2026-08-28T18:12:00.000Z'),
  point: { lat: -28.8076, lon: 153.2091 },
  polygons: [[{ lat: -28.8, lon: 153.2 }, { lat: -28.81, lon: 153.21 }, { lat: -28.82, lon: 153.2 }]],
  officialUrl: 'https://www.rfs.nsw.gov.au/fire-information/fires-near-me',
  rawAdvice: null,
}

describe('wire conversion', () => {
  it('round-trips a warning without losing data', () => {
    expect(fromWire(toWire(sample))).toEqual(sample)
  })

  it('serialises dates as ISO strings', () => {
    expect(toWire(sample).updatedAt).toBe('2026-08-29T04:12:00.000Z')
  })

  it('carries null dates through both directions', () => {
    const undated = { ...sample, updatedAt: null, publishedAt: null }
    expect(toWire(undated).updatedAt).toBeNull()
    expect(fromWire(toWire(undated)).updatedAt).toBeNull()
  })
})

describe('isSurfaceable', () => {
  it('excludes not-applicable, which dominates the live feed', () => {
    expect(isSurfaceable('not-applicable')).toBe(false)
  })

  it('includes every real alert level', () => {
    expect(isSurfaceable('emergency-warning')).toBe(true)
    expect(isSurfaceable('watch-and-act')).toBe(true)
    expect(isSurfaceable('advice')).toBe(true)
    expect(isSurfaceable('planned-burn')).toBe(true)
  })
})

describe('SEVERITY', () => {
  it('ranks emergency warning above every other level', () => {
    expect(SEVERITY['emergency-warning']).toBeGreaterThan(SEVERITY['watch-and-act'])
    expect(SEVERITY['watch-and-act']).toBeGreaterThan(SEVERITY['advice'])
    expect(SEVERITY['advice']).toBeGreaterThan(SEVERITY['planned-burn'])
  })
})
