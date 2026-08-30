import type { LatLon, PolygonRing } from './warning'

/**
 * Projects official warning geometry into a small view box.
 *
 * Equirectangular with a cosine correction on longitude. Over a fire-sized
 * area that is accurate to well under a pixel, and unlike a real projection
 * it needs no library and no network.
 *
 * WHY THERE ARE NO MAP TILES HERE
 *
 * A tile-based map requests imagery for the area you are standing in, which
 * tells the tile provider where you are. SafeSignal's privacy claim is that
 * location never leaves the device, and `/api/warnings` takes no parameters
 * precisely so there is no channel for it. Adding tiles would open one, and
 * would also stop the view working offline, which is when it matters most.
 *
 * So this draws the official polygon and your position, and nothing else.
 * It is the real shape the RFS published, not an illustration of one.
 */

export interface Bounds {
  minLat: number
  maxLat: number
  minLon: number
  maxLon: number
}

export interface ViewPoint {
  x: number
  y: number
}

/** Smallest span shown, in degrees. Stops a tiny fire filling the frame. */
const MIN_SPAN = 0.02

export function boundsOf(polygons: PolygonRing[], extra: LatLon[] = []): Bounds | null {
  const points = [...polygons.flat(), ...extra]
  if (points.length === 0) return null

  let minLat = Infinity
  let maxLat = -Infinity
  let minLon = Infinity
  let maxLon = -Infinity

  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue
    minLat = Math.min(minLat, p.lat)
    maxLat = Math.max(maxLat, p.lat)
    minLon = Math.min(minLon, p.lon)
    maxLon = Math.max(maxLon, p.lon)
  }

  if (!Number.isFinite(minLat)) return null
  return { minLat, maxLat, minLon, maxLon }
}

/** Grows the bounds so nothing sits on the frame edge. */
export function padBounds(bounds: Bounds, factor = 0.35): Bounds {
  const midLat = (bounds.minLat + bounds.maxLat) / 2
  const midLon = (bounds.minLon + bounds.maxLon) / 2
  const latSpan = Math.max(MIN_SPAN, bounds.maxLat - bounds.minLat) * (1 + factor)
  // Longitude degrees are shorter at this latitude, so the same on-screen
  // distance needs more of them. Without this the shape comes out squashed.
  const lonScale = Math.max(0.2, Math.cos((midLat * Math.PI) / 180))
  const lonSpan = Math.max(MIN_SPAN / lonScale, bounds.maxLon - bounds.minLon) * (1 + factor)

  return {
    minLat: midLat - latSpan / 2,
    maxLat: midLat + latSpan / 2,
    minLon: midLon - lonSpan / 2,
    maxLon: midLon + lonSpan / 2,
  }
}

/**
 * Builds a projector into a square view box, preserving shape.
 *
 * The larger of the two spans sets the scale for both axes, so the geometry
 * keeps its proportions instead of being stretched to fill the frame.
 */
export function projector(bounds: Bounds, size: number): (p: LatLon) => ViewPoint {
  const midLat = (bounds.minLat + bounds.maxLat) / 2
  const lonScale = Math.max(0.2, Math.cos((midLat * Math.PI) / 180))

  const latSpan = Math.max(1e-9, bounds.maxLat - bounds.minLat)
  const lonSpan = Math.max(1e-9, (bounds.maxLon - bounds.minLon) * lonScale)
  const span = Math.max(latSpan, lonSpan)

  const midLon = (bounds.minLon + bounds.maxLon) / 2

  return (p: LatLon): ViewPoint => ({
    x: size / 2 + ((p.lon - midLon) * lonScale * size) / span,
    // Latitude increases northward; screen y increases downward.
    y: size / 2 - ((p.lat - midLat) * size) / span,
  })
}

export function ringToPath(ring: PolygonRing, project: (p: LatLon) => ViewPoint): string {
  if (ring.length < 3) return ''
  const [first, ...rest] = ring.map(project)
  return `M ${first.x.toFixed(2)} ${first.y.toFixed(2)} ` +
    rest.map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ') + ' Z'
}
