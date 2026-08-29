import { describe, it, expect } from 'vitest'
import {
  BOUNDARY_EPSILON,
  checkRing,
  containment,
  containmentInAny,
  haversineKm,
  isValidLatLon,
  pointInAnyPolygon,
  pointInRing,
  pointOnRing,
  pointStrictlyInRing,
  usablePolygons,
} from './geo'
import type { LatLon, PolygonRing } from './warning'

const p = (lat: number, lon: number): LatLon => ({ lat, lon })

/** A 0.2 x 0.2 degree square around Katoomba, closed. */
const SQUARE: PolygonRing = [
  p(-33.8, 150.2), p(-33.8, 150.4), p(-33.6, 150.4), p(-33.6, 150.2), p(-33.8, 150.2),
]

/** A concave "C" shape, to catch naive containment. */
const CONCAVE: PolygonRing = [
  p(0, 0), p(0, 4), p(4, 4), p(4, 0), p(3, 0), p(3, 3), p(1, 3), p(1, 0), p(0, 0),
]

describe('haversineKm', () => {
  it('is zero for the same point', () => {
    expect(haversineKm(p(-33.7, 150.3), p(-33.7, 150.3))).toBe(0)
  })

  it('is symmetric', () => {
    const a = p(-33.8688, 151.2093)
    const b = p(-37.8136, 144.9631)
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 9)
  })

  it('matches the known Sydney to Melbourne great-circle distance', () => {
    const km = haversineKm(p(-33.8688, 151.2093), p(-37.8136, 144.9631))
    expect(km).toBeGreaterThan(700)
    expect(km).toBeLessThan(720)
  })
})

describe('isValidLatLon', () => {
  it.each([
    [{ lat: 0, lon: 0 }, true],
    [{ lat: -33.7, lon: 150.3 }, true],
    [{ lat: -90, lon: -180 }, true],
    [{ lat: 90, lon: 180 }, true],
    [{ lat: -91, lon: 0 }, false],
    [{ lat: 0, lon: 181 }, false],
    [{ lat: NaN, lon: 0 }, false],
    [{ lat: 0, lon: Infinity }, false],
    [{ lat: '0', lon: 0 }, false],
    [null, false],
    [undefined, false],
    [{}, false],
  ])('validates %j as %s', (input, expected) => {
    expect(isValidLatLon(input)).toBe(expected)
  })
})

describe('ring validation', () => {
  it('accepts a well formed closed ring', () => {
    expect(checkRing(SQUARE)).toEqual({ valid: true })
  })

  it('accepts an unclosed ring', () => {
    expect(checkRing(SQUARE.slice(0, 4))).toEqual({ valid: true })
  })

  it('rejects a ring with fewer than three points', () => {
    expect(checkRing([p(0, 0), p(1, 1)])).toEqual({ valid: false, problem: 'too-few-points' })
    expect(checkRing([])).toEqual({ valid: false, problem: 'too-few-points' })
  })

  it('rejects a ring containing a non-finite or out-of-range coordinate', () => {
    expect(checkRing([p(0, 0), p(NaN, 1), p(1, 1)]))
      .toEqual({ valid: false, problem: 'invalid-coordinate' })
    expect(checkRing([p(0, 0), p(95, 1), p(1, 1)]))
      .toEqual({ valid: false, problem: 'invalid-coordinate' })
  })

  it('rejects a ring whose points are all the same', () => {
    expect(checkRing([p(1, 1), p(1, 1), p(1, 1), p(1, 1)]))
      .toEqual({ valid: false, problem: 'degenerate' })
  })

  it('rejects a collinear ring, which encloses nothing', () => {
    expect(checkRing([p(0, 0), p(1, 1), p(2, 2), p(0, 0)]))
      .toEqual({ valid: false, problem: 'degenerate' })
  })

  it('separates usable rings from unusable ones and counts the rejects', () => {
    const result = usablePolygons([SQUARE, [p(0, 0), p(1, 1)], CONCAVE])
    expect(result.usable).toHaveLength(2)
    expect(result.rejected).toBe(1)
  })

  it('treats a missing polygon list as no polygons rather than throwing', () => {
    expect(usablePolygons(undefined as unknown as PolygonRing[]))
      .toEqual({ usable: [], rejected: 0 })
  })
})

describe('point inside polygon', () => {
  it('finds a point at the centre', () => {
    expect(containment(p(-33.7, 150.3), SQUARE)).toBe('inside')
    expect(pointInRing(p(-33.7, 150.3), SQUARE)).toBe(true)
  })

  it('finds a point just inside an edge', () => {
    expect(containment(p(-33.7, 150.2 + 1e-6), SQUARE)).toBe('inside')
  })

  it('handles a concave shape without false positives in the notch', () => {
    expect(containment(p(2, 3.5), CONCAVE)).toBe('inside')
    // The notch between the arms is outside the shape.
    expect(containment(p(2, 1.5), CONCAVE)).toBe('outside')
  })
})

describe('point outside polygon', () => {
  it('rejects a point well away', () => {
    expect(containment(p(-30, 145), SQUARE)).toBe('outside')
    expect(pointInRing(p(-30, 145), SQUARE)).toBe(false)
  })

  it('rejects a point just outside an edge', () => {
    expect(containment(p(-33.7, 150.2 - 1e-6), SQUARE)).toBe('outside')
  })

  it('rejects a point sharing a latitude but not inside', () => {
    expect(containment(p(-33.7, 151.0), SQUARE)).toBe('outside')
  })
})

describe('point on boundary', () => {
  it('reports a point on an edge as boundary, and counts it as inside', () => {
    const onEdge = p(-33.7, 150.2)
    expect(containment(onEdge, SQUARE)).toBe('boundary')
    expect(pointInRing(onEdge, SQUARE)).toBe(true)
  })

  it('reports every vertex as boundary', () => {
    for (const vertex of SQUARE) {
      expect(containment(vertex, SQUARE), `${vertex.lat},${vertex.lon}`).toBe('boundary')
      expect(pointInRing(vertex, SQUARE)).toBe(true)
    }
  })

  it('reports a point within the epsilon of an edge as boundary', () => {
    const nearlyOn = p(-33.7, 150.2 + BOUNDARY_EPSILON / 2)
    expect(containment(nearlyOn, SQUARE)).toBe('boundary')
  })

  it('does not depend on ray casting, which is arbitrary on an edge', () => {
    // The safety property: whatever pointStrictlyInRing says about a vertex,
    // containment() still calls it boundary and pointInRing still says true.
    const vertex = SQUARE[0]
    const strict = pointStrictlyInRing(vertex, SQUARE)
    expect([true, false]).toContain(strict)
    expect(pointInRing(vertex, SQUARE)).toBe(true)
  })

  it('detects a point on a horizontal and a vertical edge alike', () => {
    expect(pointOnRing(p(-33.8, 150.3), SQUARE)).toBe(true)
    expect(pointOnRing(p(-33.65, 150.4), SQUARE)).toBe(true)
  })

  it('does not report an interior point as being on the boundary', () => {
    expect(pointOnRing(p(-33.7, 150.3), SQUARE)).toBe(false)
  })
})

describe('multiple rings', () => {
  const FAR: PolygonRing = [p(-20, 140), p(-20, 141), p(-19, 141), p(-19, 140), p(-20, 140)]

  it('is inside when any ring contains the point', () => {
    expect(containmentInAny(p(-33.7, 150.3), [FAR, SQUARE])).toBe('inside')
    expect(pointInAnyPolygon(p(-33.7, 150.3), [FAR, SQUARE])).toBe(true)
  })

  it('prefers inside over boundary when rings overlap', () => {
    // Spans past SQUARE's western edge, so a point on that edge is strictly
    // inside this ring while sitting exactly on SQUARE's boundary.
    const overlapping: PolygonRing = [
      p(-33.9, 150.1), p(-33.9, 150.3), p(-33.5, 150.3), p(-33.5, 150.1), p(-33.9, 150.1),
    ]
    const onSquareEdge = p(-33.7, 150.2)
    expect(containment(onSquareEdge, SQUARE)).toBe('boundary')
    expect(containment(onSquareEdge, overlapping)).toBe('inside')
    expect(containmentInAny(onSquareEdge, [SQUARE, overlapping])).toBe('inside')
  })

  it('is outside only when no ring contains the point', () => {
    expect(containmentInAny(p(0, 0), [FAR, SQUARE])).toBe('outside')
    expect(pointInAnyPolygon(p(0, 0), [FAR, SQUARE])).toBe(false)
  })

  it('is outside for an empty ring list', () => {
    expect(containmentInAny(p(0, 0), [])).toBe('outside')
  })
})
