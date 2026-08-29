import { parseDescription, parsePubDate, parseUpdated, parseSizeHa } from './parse'
import { validateFeed, type FeedRejection } from './validate'
import { dedupeWarnings } from './dedupe'
import type {
  AlertLevel,
  LatLon,
  PolygonRing,
  RawIncident,
  Warning,
  WarningProvenance,
} from '@/lib/domain/warning'

export const FEED_SOURCE = {
  source: 'nsw-rfs',
  sourceName: 'NSW Rural Fire Service',
  feedUrl: 'https://www.rfs.nsw.gov.au/feeds/majorIncidents.json',
  // Declared by the feed's own RSS channel.
  copyright: 'State of New South Wales (NSW Rural Fire Service)',
} as const

export interface FeedContext {
  retrievedAt: Date
  feedLastModified: Date | null
}

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

export function normalizeFeature(feature: unknown, context: FeedContext): Warning | null {
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

  // The source record, kept verbatim and never derived from. If the RFS adds
  // a field tomorrow it survives here even though this build cannot read it.
  const raw: RawIncident = { properties: { ...p }, geometry: f.geometry ?? null }

  const provenance: WarningProvenance = {
    ...FEED_SOURCE,
    retrievedAt: context.retrievedAt,
    feedLastModified: context.feedLastModified,
    transform: 'normalized',
  }

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
    // The feed carries no free-text advice: its description is nine
    // structured fields and nothing else. Verified against the live feed on
    // 2026-08-30. This stays null rather than being filled with something
    // SafeSignal wrote, because inventing advice is the one thing this
    // application must never do.
    rawAdvice: null,
    fields,
    raw,
    provenance,
  }
}

export interface NormalizedFeed {
  warnings: Warning[]
  /** Features that could not be read. Counted, never silently discarded. */
  dropped: number
  /** Repeated incident ids collapsed. */
  duplicates: number
  /** Set when the payload was not a usable FeatureCollection at all. */
  rejected: FeedRejection | null
}

/**
 * Validation is a separate stage from normalization on purpose: an empty feed
 * means "no current incidents", a malformed feed means "trust nothing here",
 * and a caller must be able to tell those apart.
 */
export function normalizeFeed(payload: unknown, context: FeedContext): NormalizedFeed {
  const validation = validateFeed(payload)
  if (!validation.ok) {
    return { warnings: [], dropped: 0, duplicates: 0, rejected: validation.reason }
  }

  const parsed: Warning[] = []
  let dropped = 0

  for (const feature of validation.features) {
    const warning = normalizeFeature(feature, context)
    if (warning) parsed.push(warning)
    else dropped += 1
  }

  const { warnings, duplicates } = dedupeWarnings(parsed)
  return { warnings, dropped, duplicates, rejected: null }
}
