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
}

export type WarningWire = Omit<Warning, 'updatedAt' | 'publishedAt'> & {
  updatedAt: string | null
  publishedAt: string | null
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
  }
}

export function fromWire(wire: WarningWire): Warning {
  return {
    ...wire,
    updatedAt: wire.updatedAt ? new Date(wire.updatedAt) : null,
    publishedAt: wire.publishedAt ? new Date(wire.publishedAt) : null,
  }
}
