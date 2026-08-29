import { parseDescription, parsePubDate, parseUpdated, parseSizeHa } from './parse'
import type { AlertLevel, LatLon, PolygonRing, Warning } from '@/lib/domain/warning'

const CATEGORY_TO_LEVEL: Record<string, AlertLevel> = {
  'emergency warning': 'emergency-warning',
  'watch and act': 'watch-and-act',
  advice: 'advice',
  'planned burn': 'planned-burn',
  'not applicable': 'not-applicable',
}

function toLevel(category: unknown): AlertLevel {
  if (typeof category !== 'string') return 'not-applicable'
  return CATEGORY_TO_LEVEL[category.trim().toLowerCase()] ?? 'not-applicable'
}

/** GeoJSON positions are [lon, lat]. Getting this backwards puts NSW in Kazakhstan. */
function toLatLon(position: unknown): LatLon | null {
  if (!Array.isArray(position) || position.length < 2) return null
  const [lon, lat] = position
  if (typeof lat !== 'number' || typeof lon !== 'number') return null
  return { lat, lon }
}

interface Collected {
  point: LatLon | null
  polygons: PolygonRing[]
}

/** Walks Point / Polygon / MultiPolygon / nested GeometryCollection. */
function collectGeometry(geometry: unknown, into: Collected): void {
  if (!geometry || typeof geometry !== 'object') return
  const g = geometry as { type?: unknown; coordinates?: unknown; geometries?: unknown }

  if (g.type === 'Point') {
    if (!into.point) {
      const point = toLatLon(g.coordinates)
      if (point) into.point = point
    }
    return
  }

  if (g.type === 'Polygon' && Array.isArray(g.coordinates)) {
    const outer = g.coordinates[0]
    if (Array.isArray(outer)) {
      const ring = outer.map(toLatLon).filter((p): p is LatLon => p !== null)
      if (ring.length >= 3) into.polygons.push(ring)
    }
    return
  }

  if (g.type === 'MultiPolygon' && Array.isArray(g.coordinates)) {
    for (const polygon of g.coordinates) {
      collectGeometry({ type: 'Polygon', coordinates: polygon }, into)
    }
    return
  }

  if (g.type === 'GeometryCollection' && Array.isArray(g.geometries)) {
    for (const child of g.geometries) collectGeometry(child, into)
  }
}

export function normalizeFeature(feature: unknown): Warning | null {
  if (!feature || typeof feature !== 'object') return null
  const f = feature as { geometry?: unknown; properties?: unknown }
  if (!f.properties || typeof f.properties !== 'object') return null

  const p = f.properties as Record<string, unknown>
  const title = typeof p.title === 'string' ? p.title.trim() : ''
  const guid = typeof p.guid === 'string' ? p.guid : ''
  if (!title && !guid) return null

  const description = typeof p.description === 'string' ? p.description : ''
  const fields = parseDescription(description)

  const geometry: Collected = { point: null, polygons: [] }
  collectGeometry(f.geometry, geometry)

  return {
    id: guid || title,
    level: toLevel(p.category),
    title: title || fields['LOCATION'] || 'Unknown location',
    location: fields['LOCATION'] ?? '',
    council: fields['COUNCIL AREA'] ?? '',
    status: fields['STATUS'] ?? '',
    type: fields['TYPE'] ?? '',
    sizeHa: parseSizeHa(fields['SIZE']),
    agency: fields['RESPONSIBLE AGENCY'] ?? '',
    updatedAt: parseUpdated(fields['UPDATED']),
    publishedAt: parsePubDate(typeof p.pubDate === 'string' ? p.pubDate : undefined),
    point: geometry.point,
    polygons: geometry.polygons,
    officialUrl:
      typeof p.link === 'string' && p.link
        ? p.link
        : 'https://www.rfs.nsw.gov.au/fire-information/fires-near-me',
    rawAdvice: null,
  }
}

export function normalizeFeed(raw: unknown): { warnings: Warning[]; dropped: number } {
  if (!raw || typeof raw !== 'object') return { warnings: [], dropped: 0 }
  const features = (raw as { features?: unknown }).features
  if (!Array.isArray(features)) return { warnings: [], dropped: 0 }

  const warnings: Warning[] = []
  let dropped = 0

  for (const feature of features) {
    const warning = normalizeFeature(feature)
    if (warning) warnings.push(warning)
    else dropped += 1
  }

  return { warnings, dropped }
}
