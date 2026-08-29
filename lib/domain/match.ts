import { haversineKm, pointInAnyPolygon } from './geo'
import { SEVERITY, isSurfaceable, type AlertLevel, type LatLon, type Warning } from './warning'

export type Band = 'inside' | 'very-close' | 'close' | 'nearby' | 'unknown'

/** A distant emergency warning still matters; a distant planned burn does not. */
export const SURFACE_RADIUS_KM: Record<AlertLevel, number> = {
  'emergency-warning': 50,
  'watch-and-act': 30,
  advice: 20,
  'planned-burn': 10,
  'not-applicable': 0,
}

export interface RelevantWarning {
  warning: Warning
  distanceKm: number | null
  inside: boolean
  band: Band
}

function bandFor(distanceKm: number): Band {
  if (distanceKm < 5) return 'very-close'
  if (distanceKm < 15) return 'close'
  return 'nearby'
}

export function matchWarnings(warnings: Warning[], at: LatLon | null): RelevantWarning[] {
  const relevant: RelevantWarning[] = []

  for (const warning of warnings) {
    if (!isSurfaceable(warning.level)) continue

    // Without a location we cannot rank by proximity, so we show everything
    // surfaceable rather than nothing.
    if (!at || !warning.point) {
      relevant.push({ warning, distanceKm: null, inside: false, band: 'unknown' })
      continue
    }

    const inside = pointInAnyPolygon(at, warning.polygons)
    const distanceKm = haversineKm(at, warning.point)

    if (!inside && distanceKm > SURFACE_RADIUS_KM[warning.level]) continue

    relevant.push({
      warning,
      distanceKm,
      inside,
      band: inside ? 'inside' : bandFor(distanceKm),
    })
  }

  return relevant.sort((a, b) => {
    const bySeverity = SEVERITY[b.warning.level] - SEVERITY[a.warning.level]
    if (bySeverity !== 0) return bySeverity
    if (a.inside !== b.inside) return a.inside ? -1 : 1
    if (a.distanceKm === null) return b.distanceKm === null ? 0 : 1
    if (b.distanceKm === null) return -1
    return a.distanceKm - b.distanceKm
  })
}
