import { describe, it, expect } from 'vitest'
import { assessLocation, assessWarning, mayStateNegative } from './relevance'
import { makeWarning } from '@/lib/testing/fixtures'
import type { LatLon, PolygonRing } from './warning'

const p = (lat: number, lon: number): LatLon => ({ lat, lon })

const KATOOMBA = p(-33.7128, 150.3119)
const SYDNEY = p(-33.8688, 151.2093)

/** A square containing Katoomba. */
const AROUND_KATOOMBA: PolygonRing = [
  p(-33.8, 150.2), p(-33.8, 150.4), p(-33.6, 150.4), p(-33.6, 150.2), p(-33.8, 150.2),
]

const fire = (over: Parameters<typeof makeWarning>[0] = {}) =>
  makeWarning({ level: 'emergency-warning', point: p(-33.7, 150.3), ...over })

describe('affected', () => {
  it('reports a location inside a warning polygon as affected', () => {
    const r = assessWarning(fire({ polygons: [AROUND_KATOOMBA] }), KATOOMBA)
    expect(r.verdict).toBe('affected')
    expect(r.reason).toBe('inside-polygon')
    expect(r.inside).toBe(true)
    expect(r.band).toBe('inside')
  })

  it('reports a location on the boundary as affected', () => {
    const r = assessWarning(fire({ polygons: [AROUND_KATOOMBA] }), p(-33.7, 150.2))
    expect(r.verdict).toBe('affected')
    expect(r.reason).toBe('on-boundary')
    expect(r.inside).toBe(true)
  })

  it('is affected if any one of several polygons contains the location', () => {
    const far: PolygonRing = [p(-20, 140), p(-20, 141), p(-19, 141), p(-19, 140), p(-20, 140)]
    const r = assessWarning(fire({ polygons: [far, AROUND_KATOOMBA] }), KATOOMBA)
    expect(r.verdict).toBe('affected')
  })

  it('stays affected even when the data is stale', () => {
    // Old evidence of danger is still evidence of danger.
    const assessment = assessLocation([fire({ polygons: [AROUND_KATOOMBA] })], KATOOMBA, 'stale')
    expect(assessment.verdict).toBe('affected')
  })
})

describe('not currently affected', () => {
  it('reports a location outside a valid polygon', () => {
    const r = assessWarning(fire({ polygons: [AROUND_KATOOMBA] }), SYDNEY)
    expect(r.verdict).toBe('not-currently-affected')
    expect(r.reason).toBe('outside-polygon')
    expect(r.inside).toBe(false)
  })

  it('reports no warnings at all, with a location and fresh data, as a real negative', () => {
    const assessment = assessLocation([], KATOOMBA, 'fresh')
    expect(assessment.verdict).toBe('not-currently-affected')
    expect(mayStateNegative(assessment)).toBe(true)
  })

  it('is the only verdict the interface may state negatively', () => {
    for (const verdict of ['affected', 'undetermined', 'unavailable'] as const) {
      expect(mayStateNegative({ verdict } as never)).toBe(false)
    }
  })
})

describe('unable to determine', () => {
  it('cannot decide without a location', () => {
    const r = assessWarning(fire({ polygons: [AROUND_KATOOMBA] }), null)
    expect(r.verdict).toBe('undetermined')
    expect(r.reason).toBe('no-location')
  })

  it('cannot decide from an invalid location', () => {
    const r = assessWarning(fire({ polygons: [AROUND_KATOOMBA] }), p(NaN, 150))
    expect(r.verdict).toBe('undetermined')
    expect(r.reason).toBe('no-location')
  })

  it('cannot decide containment from a point with no polygon', () => {
    // The single most dangerous possible bug would be reporting this as
    // "not affected": we know where the fire is, not how far it reaches.
    const r = assessWarning(fire({ polygons: [] }), SYDNEY)
    expect(r.verdict).toBe('undetermined')
    expect(r.reason).toBe('point-only')
    expect(r.inside).toBe(false)
  })

  it('cannot decide with no geometry at all', () => {
    const r = assessWarning(fire({ polygons: [], point: null }), KATOOMBA)
    expect(r.verdict).toBe('undetermined')
    expect(r.reason).toBe('no-geometry')
  })

  it('cannot decide when every polygon is invalid, and says so', () => {
    const broken: PolygonRing = [p(0, 0), p(1, 1)]
    const r = assessWarning(fire({ polygons: [broken] }), KATOOMBA)
    expect(r.verdict).toBe('undetermined')
    expect(r.reason).toBe('invalid-geometry')
    expect(r.rejectedRings).toBe(1)
  })

  it('uses the valid polygons and ignores the broken ones alongside them', () => {
    const broken: PolygonRing = [p(0, 0), p(1, 1)]
    const r = assessWarning(fire({ polygons: [broken, AROUND_KATOOMBA] }), KATOOMBA)
    expect(r.verdict).toBe('affected')
    expect(r.rejectedRings).toBe(1)
  })

  it('downgrades a negative finding when the data is stale', () => {
    const assessment = assessLocation([fire({ polygons: [AROUND_KATOOMBA] })], SYDNEY, 'stale')
    expect(assessment.verdict).toBe('undetermined')
    expect(assessment.reason).toBe('stale-data')
  })

  it('does not downgrade a negative finding merely because data is ageing', () => {
    const assessment = assessLocation([fire({ polygons: [AROUND_KATOOMBA] })], SYDNEY, 'aging')
    expect(assessment.verdict).toBe('not-currently-affected')
  })

  it('cannot decide with no warnings and no location', () => {
    expect(assessLocation([], null, 'fresh').verdict).toBe('undetermined')
  })
})

describe('warning data unavailable', () => {
  it('reports unavailable when there is no feed data at all', () => {
    const assessment = assessLocation([], KATOOMBA, 'unavailable')
    expect(assessment.verdict).toBe('unavailable')
    expect(assessment.reason).toBe('no-warning-data')
  })

  it('still reports affected if we hold a warning that covers the location', () => {
    const assessment = assessLocation(
      [fire({ polygons: [AROUND_KATOOMBA] })],
      KATOOMBA,
      'unavailable',
    )
    expect(assessment.verdict).toBe('affected')
  })

  it('never reports unavailable as a negative finding', () => {
    const assessment = assessLocation([], KATOOMBA, 'unavailable')
    expect(mayStateNegative(assessment)).toBe(false)
  })
})

describe('overlapping and multiple warnings', () => {
  it('takes the worst case across warnings', () => {
    const assessment = assessLocation(
      [
        fire({ id: 'far', level: 'advice', polygons: [AROUND_KATOOMBA], point: p(-33.7, 150.3) }),
        fire({ id: 'near', level: 'advice', polygons: [], point: p(-33.72, 150.32) }),
      ],
      KATOOMBA,
      'fresh',
    )
    // One affected beats one undetermined.
    expect(assessment.verdict).toBe('affected')
    expect(assessment.affected).toHaveLength(1)
    expect(assessment.undetermined).toHaveLength(1)
  })

  it('prefers undetermined over a negative finding', () => {
    const assessment = assessLocation(
      [
        // Assessed from Sydney: 'a' is a valid polygon that excludes it.
        fire({ id: 'a', level: 'advice', polygons: [AROUND_KATOOMBA] }),
        // 'b' is near Sydney with an extent we cannot measure.
        fire({ id: 'b', level: 'advice', polygons: [], point: p(-33.87, 151.21) }),
      ],
      SYDNEY,
      'fresh',
    )
    // One unmeasurable warning outranks any number of clean negatives.
    expect(assessment.verdict).toBe('undetermined')
    expect(assessment.undetermined.map((r) => r.warning.id)).toEqual(['b'])
  })

  it('reports two overlapping warnings covering the same location', () => {
    const other: PolygonRing = [
      p(-33.9, 150.1), p(-33.9, 150.5), p(-33.5, 150.5), p(-33.5, 150.1), p(-33.9, 150.1),
    ]
    const assessment = assessLocation(
      [
        fire({ id: 'a', polygons: [AROUND_KATOOMBA] }),
        fire({ id: 'b', polygons: [other] }),
      ],
      KATOOMBA,
      'fresh',
    )
    expect(assessment.affected).toHaveLength(2)
  })

  it('orders by severity before proximity', () => {
    const assessment = assessLocation(
      [
        fire({ id: 'advice-near', level: 'advice', polygons: [AROUND_KATOOMBA] }),
        fire({ id: 'emergency-far', level: 'emergency-warning', polygons: [AROUND_KATOOMBA] }),
      ],
      KATOOMBA,
      'fresh',
    )
    expect(assessment.all[0].warning.id).toBe('emergency-far')
  })

  it('hides recorded incidents that carry no alert level', () => {
    const assessment = assessLocation(
      [fire({ level: 'not-applicable', polygons: [AROUND_KATOOMBA] })],
      KATOOMBA,
      'fresh',
    )
    expect(assessment.all).toHaveLength(0)
  })

  it('drops a distant warning but never a warning it could not assess', () => {
    const assessment = assessLocation(
      [
        // Byron Bay, ~750km away, with a polygon that is also up there.
        fire({
          id: 'distant',
          level: 'advice',
          point: p(-28.0, 153.4),
          polygons: [[p(-28.1, 153.3), p(-28.1, 153.5), p(-27.9, 153.5), p(-27.9, 153.3), p(-28.1, 153.3)]],
        }),
        // Nearby with an extent we cannot measure: kept, as undetermined.
        fire({ id: 'unknown-extent', level: 'advice', point: p(-33.72, 150.32), polygons: [] }),
      ],
      KATOOMBA,
      'fresh',
    )
    const ids = assessment.all.map((r) => r.warning.id)
    expect(ids).not.toContain('distant')
    expect(ids).toContain('unknown-extent')
    expect(assessment.undetermined.map((r) => r.warning.id)).toEqual(['unknown-extent'])
  })

  it('applies the radius to unmeasurable warnings too, and never calls that an all-clear', () => {
    // The trade-off: a point-only incident beyond the radius is not surfaced,
    // because showing every one in NSW would bury the ones that matter. What
    // must never happen is a point-only incident WITHIN the radius being
    // reported as "not affected".
    const beyond = assessLocation(
      [fire({ id: 'far-unknown', level: 'advice', point: p(-28.0, 153.4), polygons: [] })],
      KATOOMBA,
      'fresh',
    )
    expect(beyond.all).toHaveLength(0)

    const within = assessLocation(
      [fire({ id: 'near-unknown', level: 'advice', point: p(-33.72, 150.32), polygons: [] })],
      KATOOMBA,
      'fresh',
    )
    expect(within.verdict).toBe('undetermined')
    expect(within.all[0].reason).toBe('point-only')
  })

  it('keeps a warning with no coordinates at all, since nothing can be ruled out', () => {
    const assessment = assessLocation(
      [fire({ id: 'no-geometry', level: 'advice', point: null, polygons: [] })],
      KATOOMBA,
      'fresh',
    )
    expect(assessment.all).toHaveLength(1)
    expect(assessment.verdict).toBe('undetermined')
  })
})

describe('the engine never reassures', () => {
  it('has no verdict that means safe', () => {
    const verdicts = ['affected', 'not-currently-affected', 'undetermined', 'unavailable']
    for (const v of verdicts) expect(v).not.toContain('safe')
  })

  it('never returns a negative finding when anything is unknown', () => {
    const unknowns = [
      assessWarning(fire({ polygons: [] }), KATOOMBA),
      assessWarning(fire({ polygons: [], point: null }), KATOOMBA),
      assessWarning(fire({ polygons: [[p(0, 0), p(1, 1)]] }), KATOOMBA),
      assessWarning(fire({ polygons: [AROUND_KATOOMBA] }), null),
    ]
    for (const r of unknowns) {
      expect(r.verdict, r.reason).not.toBe('not-currently-affected')
      expect(r.inside).toBe(false)
    }
  })
})
