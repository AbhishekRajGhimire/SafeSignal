export type AlertLevel =
  | 'emergency-warning'
  | 'watch-and-act'
  | 'advice'
  | 'planned-burn'
  | 'not-applicable'

export const ALERT_LEVELS: readonly AlertLevel[] = [
  'emergency-warning',
  'watch-and-act',
  'advice',
  'planned-burn',
  'not-applicable',
] as const

/** Higher is more urgent. Drives sort order everywhere. */
export const SEVERITY: Record<AlertLevel, number> = {
  'emergency-warning': 4,
  'watch-and-act': 3,
  advice: 2,
  'planned-burn': 1,
  'not-applicable': 0,
}

export interface LatLon {
  lat: number
  lon: number
}

/** Outer ring of a polygon. Holes are intentionally not modelled. */
export type PolygonRing = LatLon[]

/**
 * Where a piece of warning data came from, and what we did to it.
 *
 * SafeSignal never authors emergency advice. Every field on a Warning is
 * either copied verbatim from the official feed or mechanically derived from
 * it, and `transform` records which.
 */
export type Transform = 'verbatim' | 'normalized'

export interface WarningProvenance {
  /** The issuing authority. Never anything but the official source. */
  source: 'nsw-rfs'
  sourceName: string
  feedUrl: string
  copyright: string
  /** When SafeSignal retrieved the payload this warning came from. */
  retrievedAt: Date
  /** The feed's own Last-Modified, when it supplied one. */
  feedLastModified: Date | null
  transform: Transform
}

/**
 * The untouched source record. Kept so the official content can always be
 * shown exactly as issued, and so a field the RFS adds later is never lost
 * just because this build did not know about it.
 *
 * Never rendered as advice, never mutated, never derived from.
 */
export interface RawIncident {
  properties: Record<string, unknown>
  geometry: unknown
}

export interface Warning {
  id: string
  level: AlertLevel
  title: string
  location: string
  council: string
  status: string
  type: string
  sizeHa: number | null
  agency: string
  updatedAt: Date | null
  publishedAt: Date | null
  point: LatLon | null
  polygons: PolygonRing[]
  officialUrl: string
  rawAdvice: string | null
  /** Every key/value the feed's description carried, including unknown keys. */
  fields: Record<string, string>
  /** The source record, verbatim. */
  raw: RawIncident
  provenance: WarningProvenance
}

export type ProvenanceWire = Omit<WarningProvenance, 'retrievedAt' | 'feedLastModified'> & {
  retrievedAt: string
  feedLastModified: string | null
}

export type WarningWire = Omit<
  Warning,
  'updatedAt' | 'publishedAt' | 'provenance'
> & {
  updatedAt: string | null
  publishedAt: string | null
  provenance: ProvenanceWire
}

/**
 * `not-applicable` incidents are 41 of 53 features in a typical feed.
 * They carry no alert level, so surfacing them would bury the real
 * warnings and train users to ignore the app.
 */
export function isSurfaceable(level: AlertLevel): boolean {
  return level !== 'not-applicable'
}

export function toWire(warning: Warning): WarningWire {
  return {
    ...warning,
    updatedAt: warning.updatedAt ? warning.updatedAt.toISOString() : null,
    publishedAt: warning.publishedAt ? warning.publishedAt.toISOString() : null,
    provenance: {
      ...warning.provenance,
      retrievedAt: warning.provenance.retrievedAt.toISOString(),
      feedLastModified: warning.provenance.feedLastModified
        ? warning.provenance.feedLastModified.toISOString()
        : null,
    },
  }
}

export function fromWire(wire: WarningWire): Warning {
  return {
    ...wire,
    updatedAt: wire.updatedAt ? new Date(wire.updatedAt) : null,
    publishedAt: wire.publishedAt ? new Date(wire.publishedAt) : null,
    provenance: {
      ...wire.provenance,
      retrievedAt: new Date(wire.provenance.retrievedAt),
      feedLastModified: wire.provenance.feedLastModified
        ? new Date(wire.provenance.feedLastModified)
        : null,
    },
  }
}
