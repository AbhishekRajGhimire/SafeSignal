import { describe, it, expect } from 'vitest'
import { matchWarnings, SURFACE_RADIUS_KM } from './match'
import type { AlertLevel, Warning } from './warning'
import { makeWarning } from '@/lib/testing/fixtures'

const KATOOMBA = { lat: -33.7128, lon: 150.3119 }

function warning(overrides: Partial<Warning> & { id: string; level: AlertLevel }): Warning {
  return {
    title: 'Test fire',
    location: 'Test location',
    council: 'Blue Mountains',
    status: 'Out of control',
    type: 'Bush Fire',
    sizeHa: 10,
    agency: 'Rural Fire Service',
    updatedAt: new Date('2026-08-29T04:12:00.000Z'),
    publishedAt: new Date('2026-08-29T04:12:00.000Z'),
    point: KATOOMBA,
    polygons: [],
    officialUrl: 'https://example.invalid',
    rawAdvice: null,
    fields: {},
    raw: { properties: {}, geometry: null },
    provenance: makeWarning().provenance,
    ...overrides,
  }
}

/** Roughly 1km of latitude per 0.009 degrees. */
function kmNorth(from: { lat: number; lon: number }, km: number) {
  return { lat: from.lat + km * 0.009, lon: from.lon }
}

describe('matchWarnings', () => {
  it('never surfaces not-applicable incidents', () => {
    const result = matchWarnings([warning({ id: 'a', level: 'not-applicable' })], KATOOMBA)
    expect(result).toHaveLength(0)
  })

  it('sorts by severity before distance', () => {
    const result = matchWarnings(
      [
        warning({ id: 'near-advice', level: 'advice', point: kmNorth(KATOOMBA, 1) }),
        warning({ id: 'far-emergency', level: 'emergency-warning', point: kmNorth(KATOOMBA, 40) }),
      ],
      KATOOMBA,
    )
    expect(result.map((r) => r.warning.id)).toEqual(['far-emergency', 'near-advice'])
  })

  it('sorts by distance within the same severity', () => {
    const result = matchWarnings(
      [
        warning({ id: 'further', level: 'advice', point: kmNorth(KATOOMBA, 10) }),
        warning({ id: 'closer', level: 'advice', point: kmNorth(KATOOMBA, 2) }),
      ],
      KATOOMBA,
    )
    expect(result.map((r) => r.warning.id)).toEqual(['closer', 'further'])
  })

  it('applies the per-level surface radius', () => {
    // Advice surfaces within 20km, so one at 40km is dropped.
    const result = matchWarnings(
      [warning({ id: 'distant-advice', level: 'advice', point: kmNorth(KATOOMBA, 40) })],
      KATOOMBA,
    )
    expect(result).toHaveLength(0)
  })

  it('keeps a distant emergency warning that a distant advice would lose', () => {
    const result = matchWarnings(
      [warning({ id: 'distant-emergency', level: 'emergency-warning', point: kmNorth(KATOOMBA, 40) })],
      KATOOMBA,
    )
    expect(result).toHaveLength(1)
  })

  it('marks the user as inside when a polygon contains them', () => {
    const result = matchWarnings(
      [
        warning({
          id: 'surrounding',
          level: 'watch-and-act',
          point: kmNorth(KATOOMBA, 200),
          polygons: [[
            { lat: -34, lon: 150 },
            { lat: -34, lon: 151 },
            { lat: -33, lon: 151 },
            { lat: -33, lon: 150 },
          ]],
        }),
      ],
      KATOOMBA,
    )
    expect(result[0].inside).toBe(true)
    expect(result[0].band).toBe('inside')
  })

  it('bands by distance when there is no polygon', () => {
    const bandFor = (km: number) =>
      matchWarnings(
        [warning({ id: 'x', level: 'emergency-warning', point: kmNorth(KATOOMBA, km) })],
        KATOOMBA,
      )[0].band
    expect(bandFor(2)).toBe('very-close')
    expect(bandFor(10)).toBe('close')
    expect(bandFor(40)).toBe('nearby')
  })

  it('returns every surfaceable warning when the location is unknown', () => {
    const result = matchWarnings(
      [
        warning({ id: 'a', level: 'advice' }),
        warning({ id: 'b', level: 'not-applicable' }),
      ],
      null,
    )
    expect(result).toHaveLength(1)
    expect(result[0].distanceKm).toBeNull()
    expect(result[0].band).toBe('unknown')
  })

  it('keeps a warning with no coordinates rather than silently dropping it', () => {
    const result = matchWarnings(
      [warning({ id: 'no-geo', level: 'watch-and-act', point: null })],
      KATOOMBA,
    )
    expect(result).toHaveLength(1)
    expect(result[0].band).toBe('unknown')
  })
})

describe('SURFACE_RADIUS_KM', () => {
  it('matches the radii in the spec', () => {
    expect(SURFACE_RADIUS_KM['emergency-warning']).toBe(50)
    expect(SURFACE_RADIUS_KM['watch-and-act']).toBe(30)
    expect(SURFACE_RADIUS_KM.advice).toBe(20)
    expect(SURFACE_RADIUS_KM['planned-burn']).toBe(10)
  })
})
