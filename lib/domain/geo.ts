import type { LatLon, PolygonRing } from './warning'

const EARTH_RADIUS_KM = 6371.0088

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180

export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = toRadians(b.lat - a.lat)
  const dLon = toRadians(b.lon - a.lon)
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/* ------------------------------------------------------------------ *
 * Coordinate and ring validation
 * ------------------------------------------------------------------ */

export function isValidLatLon(point: unknown): point is LatLon {
  if (!point || typeof point !== 'object') return false
  const p = point as { lat?: unknown; lon?: unknown }
  if (typeof p.lat !== 'number' || typeof p.lon !== 'number') return false
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return false
  return p.lat >= -90 && p.lat <= 90 && p.lon >= -180 && p.lon <= 180
}

export type RingProblem =
  | 'too-few-points'
  | 'invalid-coordinate'
  | 'degenerate'

export type RingCheck = { valid: true } | { valid: false; problem: RingProblem }

/** Twice the signed area. Zero means every vertex is collinear. */
function shoelace(ring: PolygonRing): number {
  let sum = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j].lon + ring[i].lon) * (ring[j].lat - ring[i].lat)
  }
  return sum
}

/**
 * A ring must enclose an area to be able to contain anything.
 *
 * A ring that fails this is not treated as "empty" — it is treated as
 * unusable, so that a warning with broken geometry produces "cannot
 * determine" rather than the far more dangerous "not affected".
 */
export function checkRing(ring: PolygonRing): RingCheck {
  if (!Array.isArray(ring) || ring.length < 3) {
    return { valid: false, problem: 'too-few-points' }
  }
  for (const point of ring) {
    if (!isValidLatLon(point)) return { valid: false, problem: 'invalid-coordinate' }
  }
  // A closed ring repeats its first vertex, so three distinct points can
  // arrive as four entries. Count distinct positions, not entries.
  const distinct = new Set(ring.map((p) => `${p.lat},${p.lon}`))
  if (distinct.size < 3) return { valid: false, problem: 'degenerate' }
  if (Math.abs(shoelace(ring)) < Number.EPSILON) {
    return { valid: false, problem: 'degenerate' }
  }
  return { valid: true }
}

export interface PolygonSet {
  usable: PolygonRing[]
  rejected: number
}

export function usablePolygons(polygons: PolygonRing[]): PolygonSet {
  const usable: PolygonRing[] = []
  let rejected = 0
  for (const ring of polygons ?? []) {
    if (checkRing(ring).valid) usable.push(ring)
    else rejected += 1
  }
  return { usable, rejected }
}

/* ------------------------------------------------------------------ *
 * Containment
 * ------------------------------------------------------------------ */

/**
 * Tolerance for "on the edge", in degrees. Roughly a tenth of a millimetre,
 * so it catches floating-point drift without widening the fire.
 *
 * The safety decision is not this number: it is the policy in
 * `containment()` that a point on the boundary counts as inside.
 */
export const BOUNDARY_EPSILON = 1e-9

function onSegment(p: LatLon, a: LatLon, b: LatLon): boolean {
  const cross = (b.lon - a.lon) * (p.lat - a.lat) - (b.lat - a.lat) * (p.lon - a.lon)
  if (Math.abs(cross) > BOUNDARY_EPSILON) return false
  // Collinear: check it falls within the segment's bounding box.
  const withinLon = p.lon >= Math.min(a.lon, b.lon) - BOUNDARY_EPSILON &&
    p.lon <= Math.max(a.lon, b.lon) + BOUNDARY_EPSILON
  const withinLat = p.lat >= Math.min(a.lat, b.lat) - BOUNDARY_EPSILON &&
    p.lat <= Math.max(a.lat, b.lat) + BOUNDARY_EPSILON
  return withinLon && withinLat
}

/** True when the point lies on any edge or vertex of the ring. */
export function pointOnRing(point: LatLon, ring: PolygonRing): boolean {
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    if (onSegment(point, ring[j], ring[i])) return true
  }
  return false
}

/**
 * Ray casting in lon/lat space. Fire polygons span a few kilometres, so
 * treating degrees as a flat plane is accurate enough and avoids a
 * projection step.
 *
 * Boundary points are excluded here and handled by `containment()`, because
 * ray casting gives an arbitrary answer for a point exactly on an edge.
 */
export function pointStrictlyInRing(point: LatLon, ring: PolygonRing): boolean {
  if (ring.length < 3) return false

  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i].lat
    const xi = ring[i].lon
    const yj = ring[j].lat
    const xj = ring[j].lon

    const straddles = yi > point.lat !== yj > point.lat
    if (!straddles) continue

    const crossingLon = ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi
    if (point.lon < crossingLon) inside = !inside
  }
  return inside
}

export type Containment = 'inside' | 'boundary' | 'outside'

/**
 * Where a point sits relative to one ring.
 *
 * A point on the boundary is reported as `boundary`, and every caller in
 * SafeSignal treats that as affected. Being told you are in a fire area when
 * you are on its edge is survivable; the reverse is not.
 */
export function containment(point: LatLon, ring: PolygonRing): Containment {
  if (pointOnRing(point, ring)) return 'boundary'
  return pointStrictlyInRing(point, ring) ? 'inside' : 'outside'
}

/** Kept for callers that only need a yes/no. Boundary counts as inside. */
export function pointInRing(point: LatLon, ring: PolygonRing): boolean {
  return containment(point, ring) !== 'outside'
}

export function pointInAnyPolygon(point: LatLon, polygons: PolygonRing[]): boolean {
  return polygons.some((ring) => pointInRing(point, ring))
}

/** The strongest containment across a set of rings. */
export function containmentInAny(point: LatLon, polygons: PolygonRing[]): Containment {
  let best: Containment = 'outside'
  for (const ring of polygons) {
    const result = containment(point, ring)
    if (result === 'inside') return 'inside'
    if (result === 'boundary') best = 'boundary'
  }
  return best
}
