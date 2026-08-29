import { describe, it, expect } from 'vitest'
import { NSW_PLACES, DEFAULT_DEMO_PLACE, searchPlaces } from './nsw'

describe('NSW_PLACES', () => {
  it('has plausible NSW coordinates for every entry', () => {
    for (const place of NSW_PLACES) {
      expect(place.lat, place.label).toBeGreaterThan(-38)
      expect(place.lat, place.label).toBeLessThan(-27)
      expect(place.lon, place.label).toBeGreaterThan(140)
      expect(place.lon, place.label).toBeLessThan(154)
    }
  })

  it('has no duplicate labels', () => {
    const labels = NSW_PLACES.map((p) => p.label)
    expect(new Set(labels).size).toBe(labels.length)
  })
})

describe('DEFAULT_DEMO_PLACE', () => {
  it('is a Blue Mountains location, per the spec', () => {
    expect(DEFAULT_DEMO_PLACE.label).toBe('Katoomba')
  })
})

describe('searchPlaces', () => {
  it('matches on partial name, case-insensitively', () => {
    expect(searchPlaces('katoo').map((p) => p.label)).toContain('Katoomba')
    expect(searchPlaces('KATOO').map((p) => p.label)).toContain('Katoomba')
  })

  it('matches on postcode', () => {
    expect(searchPlaces('2780').map((p) => p.label)).toContain('Katoomba')
  })

  it('returns nothing for a blank query', () => {
    expect(searchPlaces('')).toEqual([])
    expect(searchPlaces('   ')).toEqual([])
  })

  it('respects the limit', () => {
    expect(searchPlaces('a', 3).length).toBeLessThanOrEqual(3)
  })
})
