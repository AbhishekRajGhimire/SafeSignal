import { containmentInAny, haversineKm, isValidLatLon, usablePolygons } from './geo'
import type { Freshness } from './freshness'
import { SEVERITY, isSurfaceable, type AlertLevel, type LatLon, type Warning } from './warning'

/**
 * The geospatial relevance engine.
 *
 * It answers one question: does this official warning affect the location the
 * user chose? It does not route, it does not instruct, and it never tells
 * anyone they are safe.
 *
 * The governing rule is that absence of evidence is not evidence of absence.
 * A warning with no polygon, broken geometry, or a location we do not have
 * yields `undetermined`, never `not-currently-affected`. Saying "you are not
 * affected" is a claim, and we only make it when we can support it.
 */

export type Verdict =
  /** The location is inside, or on the edge of, an official warning area. */
  | 'affected'
  /** Valid geometry, known location, and the location falls outside it. */
  | 'not-currently-affected'
  /** We cannot decide. Never to be presented as reassurance. */
  | 'undetermined'
  /** There is no warning data to reason about at all. */
  | 'unavailable'

export type VerdictReason =
  | 'inside-polygon'
  | 'on-boundary'
  | 'outside-polygon'
  | 'no-location'
  | 'no-geometry'
  | 'invalid-geometry'
  | 'point-only'
  | 'stale-data'
  | 'no-warning-data'

export type Band = 'inside' | 'very-close' | 'close' | 'nearby' | 'unknown'

export interface WarningRelevance {
  warning: Warning
  verdict: Verdict
  reason: VerdictReason
  distanceKm: number | null
  band: Band
  /** True only for `affected`. Never infer safety from this being false. */
  inside: boolean
  /** Rings the feed supplied that could not be used. */
  rejectedRings: number
}

/** A distant emergency warning still matters; a distant planned burn does not. */
export const SURFACE_RADIUS_KM: Record<AlertLevel, number> = {
  'emergency-warning': 50,
  'watch-and-act': 30,
  advice: 20,
  'planned-burn': 10,
  'not-applicable': 0,
}

function bandFor(distanceKm: number): Band {
  if (distanceKm < 5) return 'very-close'
  if (distanceKm < 15) return 'close'
  return 'nearby'
}

/**
 * Assesses one warning against one location.
 *
 * Radii are keyed on alert level only. They are never widened for a user who
 * would take longer to leave: two people in the same room must see the same
 * warnings, or the output stops being checkable against the official source.
 * Lead-time need is answered in the assistance layer instead.
 */
export function assessWarning(warning: Warning, at: LatLon | null): WarningRelevance {
  const { usable, rejected } = usablePolygons(warning.polygons)

  const base = {
    warning,
    distanceKm: null as number | null,
    band: 'unknown' as Band,
    inside: false,
    rejectedRings: rejected,
  }

  if (!at || !isValidLatLon(at)) {
    return { ...base, verdict: 'undetermined', reason: 'no-location' }
  }

  const distanceKm = warning.point && isValidLatLon(warning.point)
    ? haversineKm(at, warning.point)
    : null

  if (usable.length > 0) {
    const where = containmentInAny(at, usable)
    if (where !== 'outside') {
      return {
        ...base,
        verdict: 'affected',
        reason: where === 'boundary' ? 'on-boundary' : 'inside-polygon',
        distanceKm,
        band: 'inside',
        inside: true,
      }
    }
    return {
      ...base,
      verdict: 'not-currently-affected',
      reason: 'outside-polygon',
      distanceKm,
      band: distanceKm === null ? 'unknown' : bandFor(distanceKm),
    }
  }

  // No usable polygon. We know roughly where the incident is but not how far
  // it extends, so containment is genuinely unknown. Reporting "not affected"
  // here would be the single most dangerous thing this engine could do.
  const reason: VerdictReason = rejected > 0
    ? 'invalid-geometry'
    : warning.point
      ? 'point-only'
      : 'no-geometry'

  return {
    ...base,
    verdict: 'undetermined',
    reason,
    distanceKm,
    band: distanceKm === null ? 'unknown' : bandFor(distanceKm),
  }
}

/** Worst case first: affected, then undetermined, then not affected. */
const VERDICT_RANK: Record<Verdict, number> = {
  affected: 3,
  undetermined: 2,
  'not-currently-affected': 1,
  unavailable: 0,
}

export interface LocationAssessment {
  /** The overall answer, taken as the worst case across every warning. */
  verdict: Verdict
  reason: VerdictReason
  /** Warnings that affect this location. Present these officially. */
  affected: WarningRelevance[]
  /** Warnings we could not decide about. Never presented as reassurance. */
  undetermined: WarningRelevance[]
  /** Nearby but outside. Shown for awareness, not as an all-clear. */
  nearby: WarningRelevance[]
  /** Everything surfaceable, most urgent first. */
  all: WarningRelevance[]
  freshness: Freshness
}

function sortRelevance(a: WarningRelevance, b: WarningRelevance): number {
  const bySeverity = SEVERITY[b.warning.level] - SEVERITY[a.warning.level]
  if (bySeverity !== 0) return bySeverity
  const byVerdict = VERDICT_RANK[b.verdict] - VERDICT_RANK[a.verdict]
  if (byVerdict !== 0) return byVerdict
  if (a.distanceKm === null) return b.distanceKm === null ? 0 : 1
  if (b.distanceKm === null) return -1
  return a.distanceKm - b.distanceKm
}

/**
 * Assesses every current warning against the user's location.
 *
 * Staleness degrades a negative finding but never a positive one. Data too
 * old to trust cannot support "you are not affected", but stale evidence of
 * danger is still evidence of danger.
 */
export function assessLocation(
  warnings: Warning[],
  at: LatLon | null,
  freshness: Freshness = 'fresh',
): LocationAssessment {
  const surfaceable = warnings.filter((w) => isSurfaceable(w.level))

  const assessed = surfaceable
    .map((warning) => assessWarning(warning, at))
    .filter((r) => {
      // A confirmed hit is always surfaced.
      if (r.verdict === 'affected') return true
      // No distance at all means we cannot even rule it out on proximity.
      if (r.distanceKm === null) return true
      // Otherwise the per-level radius applies, to warnings we could not
      // assess as much as to ones we could.
      //
      // This is a deliberate trade-off. A point-only incident 40km away has
      // an extent we cannot measure, so in principle it cannot be excluded.
      // Surfacing every such incident in New South Wales would bury the ones
      // that matter, and an unreadable screen is its own safety failure. The
      // radius is the line; within it, an unmeasurable warning is reported as
      // undetermined and never as an all-clear.
      return r.distanceKm <= SURFACE_RADIUS_KM[r.warning.level]
    })
    .sort(sortRelevance)

  const affected = assessed.filter((r) => r.verdict === 'affected')
  const undetermined = assessed.filter((r) => r.verdict === 'undetermined')
  const nearby = assessed.filter((r) => r.verdict === 'not-currently-affected')

  const dataMissing = freshness === 'unavailable'

  let verdict: Verdict
  let reason: VerdictReason

  if (affected.length > 0) {
    verdict = 'affected'
    reason = affected[0].reason
  } else if (dataMissing) {
    verdict = 'unavailable'
    reason = 'no-warning-data'
  } else if (undetermined.length > 0) {
    verdict = 'undetermined'
    reason = undetermined[0].reason
  } else if (surfaceable.length === 0 && warnings.length === 0) {
    // No warnings at all. With a location and current data this is a real
    // negative finding, not an absence of information.
    verdict = at ? 'not-currently-affected' : 'undetermined'
    reason = at ? 'outside-polygon' : 'no-location'
  } else {
    verdict = 'not-currently-affected'
    reason = 'outside-polygon'
  }

  // A negative finding cannot rest on data we no longer trust.
  if (verdict === 'not-currently-affected' && freshness === 'stale') {
    verdict = 'undetermined'
    reason = 'stale-data'
  }

  return { verdict, reason, affected, undetermined, nearby, all: assessed, freshness }
}

/**
 * Whether the interface may state a negative finding.
 *
 * Even when true, the wording is "not currently affected". SafeSignal never
 * tells anyone they are safe: it reports what the official warnings cover,
 * and a fire is not the only hazard a person faces.
 */
export function mayStateNegative(assessment: LocationAssessment): boolean {
  return assessment.verdict === 'not-currently-affected'
}
