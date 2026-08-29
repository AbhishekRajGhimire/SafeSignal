import { describe, it, expect } from 'vitest'
import { haversineKm, pointInRing, pointInAnyPolygon } from './geo'

describe('haversineKm', () => {
  it('returns zero for the same point', () => {
    expect(haversineKm({ lat: -33.87, lon: 151.21 }, { lat: -33.87, lon: 151.21 })).toBe(0)
  })

  it('measures one degree of longitude at the equator as about 111km', () => {
    const km = haversineKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })
    expect(km).toBeGreaterThan(111.1)
    expect(km).toBeLessThan(111.3)
  })

  it('measures Sydney to Katoomba as roughly 80km', () => {
    const km = haversineKm({ lat: -33.8688, lon: 151.2093 }, { lat: -33.7128, lon: 150.3119 })
    expect(km).toBeGreaterThan(75)
    expect(km).toBeLessThan(90)
  })

  it('is symmetric', () => {
    const a = { lat: -33.8, lon: 151.2 }
    const b = { lat: -32.9, lon: 151.8 }
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 9)
  })
})

const square: { lat: number; lon: number }[] = [
  { lat: -34, lon: 150 },
  { lat: -34, lon: 151 },
  { lat: -33, lon: 151 },
  { lat: -33, lon: 150 },
  { lat: -34, lon: 150 },
]

describe('pointInRing', () => {
  it('finds a point inside the ring', () => {
    expect(pointInRing({ lat: -33.5, lon: 150.5 }, square)).toBe(true)
  })

  it('rejects a point outside the ring', () => {
    expect(pointInRing({ lat: -35, lon: 150.5 }, square)).toBe(false)
    expect(pointInRing({ lat: -33.5, lon: 152 }, square)).toBe(false)
  })

  it('returns false for a degenerate ring instead of throwing', () => {
    expect(pointInRing({ lat: -33.5, lon: 150.5 }, [])).toBe(false)
    expect(pointInRing({ lat: -33.5, lon: 150.5 }, [{ lat: -33, lon: 150 }])).toBe(false)
  })
})

describe('pointInAnyPolygon', () => {
  it('is true when the point falls inside any one polygon', () => {
    expect(pointInAnyPolygon({ lat: -33.5, lon: 150.5 }, [[], square])).toBe(true)
  })

  it('is false when there are no polygons', () => {
    expect(pointInAnyPolygon({ lat: -33.5, lon: 150.5 }, [])).toBe(false)
  })
})
