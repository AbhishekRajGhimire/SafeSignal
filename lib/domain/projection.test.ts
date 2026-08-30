import { describe, it, expect } from 'vitest'
import { boundsOf, padBounds, projector, ringToPath } from './projection'
import type { LatLon, PolygonRing } from './warning'

const p = (lat: number, lon: number): LatLon => ({ lat, lon })

const SQUARE: PolygonRing = [
  p(-33.80, 150.20), p(-33.80, 150.40),
  p(-33.60, 150.40), p(-33.60, 150.20), p(-33.80, 150.20),
]

describe('boundsOf', () => {
  it('spans every vertex of every ring', () => {
    expect(boundsOf([SQUARE])).toEqual({
      minLat: -33.8, maxLat: -33.6, minLon: 150.2, maxLon: 150.4,
    })
  })

  it('includes extra points such as the user position', () => {
    const b = boundsOf([SQUARE], [p(-33.9, 150.5)])!
    expect(b.minLat).toBe(-33.9)
    expect(b.maxLon).toBe(150.5)
  })

  it('returns null when there is nothing to draw', () => {
    expect(boundsOf([], [])).toBeNull()
    expect(boundsOf([[]], [])).toBeNull()
  })

  it('ignores non-finite coordinates rather than producing NaN bounds', () => {
    const b = boundsOf([[p(-33.7, 150.3), p(NaN, 150.4), p(-33.6, 150.2)]])!
    expect(Number.isFinite(b.minLat)).toBe(true)
    expect(Number.isFinite(b.maxLon)).toBe(true)
  })
})

describe('padBounds', () => {
  it('grows the frame so nothing sits on the edge', () => {
    const b = padBounds(boundsOf([SQUARE])!)
    expect(b.minLat).toBeLessThan(-33.8)
    expect(b.maxLat).toBeGreaterThan(-33.6)
  })

  it('keeps the centre where it was', () => {
    const before = boundsOf([SQUARE])!
    const after = padBounds(before)
    expect((after.minLat + after.maxLat) / 2).toBeCloseTo((before.minLat + before.maxLat) / 2, 9)
  })

  it('enforces a minimum span, so a tiny fire does not fill the frame', () => {
    const tiny = boundsOf([[p(-33.7, 150.3), p(-33.7001, 150.3001), p(-33.7002, 150.3)]])!
    const padded = padBounds(tiny)
    expect(padded.maxLat - padded.minLat).toBeGreaterThan(0.02)
  })
})

describe('projector', () => {
  const project = projector(padBounds(boundsOf([SQUARE])!), 200)

  it('puts the centre of the bounds at the centre of the view', () => {
    const centre = project(p(-33.7, 150.3))
    expect(centre.x).toBeCloseTo(100, 6)
    expect(centre.y).toBeCloseTo(100, 6)
  })

  it('puts north at the top', () => {
    // Latitude increases northward, screen y increases downward.
    expect(project(p(-33.6, 150.3)).y).toBeLessThan(project(p(-33.8, 150.3)).y)
  })

  it('puts east on the right', () => {
    expect(project(p(-33.7, 150.4)).x).toBeGreaterThan(project(p(-33.7, 150.2)).x)
  })

  it('preserves shape rather than stretching to fill the frame', () => {
    // A square of equal ground distance must project to a square. Without
    // the cosine correction the longitude side comes out too short.
    const box = projector(padBounds(boundsOf([SQUARE])!), 200)
    const width = box(p(-33.7, 150.4)).x - box(p(-33.7, 150.2)).x
    const height = box(p(-33.8, 150.3)).y - box(p(-33.6, 150.3)).y
    // 0.2deg of latitude is longer on the ground than 0.2deg of longitude
    // at 33 degrees south, by roughly 1 / cos(33.7) = 1.20.
    expect(height / width).toBeCloseTo(1 / Math.cos((33.7 * Math.PI) / 180), 1)
  })

  it('keeps everything inside the view box', () => {
    for (const vertex of SQUARE) {
      const v = project(vertex)
      expect(v.x).toBeGreaterThanOrEqual(0)
      expect(v.x).toBeLessThanOrEqual(200)
      expect(v.y).toBeGreaterThanOrEqual(0)
      expect(v.y).toBeLessThanOrEqual(200)
    }
  })
})

describe('ringToPath', () => {
  const project = projector(padBounds(boundsOf([SQUARE])!), 200)

  it('produces a closed path', () => {
    const d = ringToPath(SQUARE, project)
    expect(d.startsWith('M ')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
  })

  it('emits one line command per vertex after the first', () => {
    expect((ringToPath(SQUARE, project).match(/L /g) ?? []).length).toBe(SQUARE.length - 1)
  })

  it('draws nothing for a ring that cannot enclose an area', () => {
    expect(ringToPath([p(0, 0), p(1, 1)], project)).toBe('')
  })
})
