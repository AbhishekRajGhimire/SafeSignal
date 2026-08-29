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

/**
 * Ray casting in lon/lat space. Fire polygons span a few kilometres, so
 * treating degrees as a flat plane is accurate enough and avoids a
 * projection step.
 */
export function pointInRing(point: LatLon, ring: PolygonRing): boolean {
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

export function pointInAnyPolygon(point: LatLon, polygons: PolygonRing[]): boolean {
  return polygons.some((ring) => pointInRing(point, ring))
}
