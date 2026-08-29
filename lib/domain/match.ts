import { assessLocation, assessWarning, SURFACE_RADIUS_KM } from './relevance'
import type { Freshness } from './freshness'
import type { LatLon, Warning } from './warning'
import type { Band, LocationAssessment, WarningRelevance } from './relevance'

export { SURFACE_RADIUS_KM }
export type { Band }

/**
 * `RelevantWarning` is the shape the interface consumes. It is the relevance
 * verdict under an older name, kept so callers did not all have to change at
 * once.
 *
 * `inside` is true only for `affected`. It must never be read in reverse:
 * `inside === false` can mean "outside the fire area" or "we could not tell",
 * and only `verdict` distinguishes those.
 */
export type RelevantWarning = WarningRelevance

export function matchWarnings(
  warnings: Warning[],
  at: LatLon | null,
  freshness: Freshness = 'fresh',
): RelevantWarning[] {
  return assessLocation(warnings, at, freshness).all
}

export function matchWarning(warning: Warning, at: LatLon | null): RelevantWarning {
  return assessWarning(warning, at)
}

export function assess(
  warnings: Warning[],
  at: LatLon | null,
  freshness: Freshness = 'fresh',
): LocationAssessment {
  return assessLocation(warnings, at, freshness)
}
