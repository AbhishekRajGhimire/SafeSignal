/**
 * Graded data freshness.
 *
 * A boolean `stale` cannot express the difference between data forty seconds
 * old and data forty minutes old, and during a fire that difference decides
 * whether a screen should be trusted.
 *
 * IMPORTANT: the feed advertises two different refresh intervals. The HTTP
 * response says `cache-control: max-age=30` (thirty SECONDS) while the RSS
 * channel says `<ttl>60</ttl>` (sixty MINUTES). They disagree by a factor of
 * 120. Neither is a promise that a warning cannot change sooner, so these
 * thresholds are chosen for how long a human should trust a reading, not for
 * how often the publisher expects to write one.
 */

export type Freshness = 'fresh' | 'aging' | 'stale' | 'unavailable'

/** Under two minutes: as good as live. */
export const FRESH_MS = 2 * 60_000
/** Under fifteen minutes: usable, but say so. */
export const AGING_MS = 15 * 60_000

export function freshnessOf(fetchedAt: Date | null, now: Date = new Date()): Freshness {
  if (!fetchedAt) return 'unavailable'
  const age = now.getTime() - fetchedAt.getTime()
  // A clock skew that puts the fetch in the future is treated as fresh
  // rather than as an error: the data did just arrive.
  if (age < 0) return 'fresh'
  if (age < FRESH_MS) return 'fresh'
  if (age < AGING_MS) return 'aging'
  return 'stale'
}

export function ageMs(fetchedAt: Date | null, now: Date = new Date()): number | null {
  if (!fetchedAt) return null
  return Math.max(0, now.getTime() - fetchedAt.getTime())
}

/**
 * True when the app should stop implying its own data is authoritative and
 * point the user at the official channels instead.
 */
export function shouldDeferToOfficialSources(freshness: Freshness): boolean {
  return freshness === 'stale' || freshness === 'unavailable'
}
