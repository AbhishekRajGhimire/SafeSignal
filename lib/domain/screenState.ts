import type { LocationAssessment } from './relevance'
import type { WarningChange } from './lifecycle'
import type { FeedFailure } from '@/lib/rfs/fetch'

/**
 * The seven states the warning experience can be in.
 *
 * Derived from the relevance verdict, the freshness of the data, and what
 * changed since the last poll. Kept as pure logic so the interface only has
 * to render, and so every state can be tested without a browser.
 */
export type ScreenState =
  | 'loading'
  | 'warning'
  | 'warning-updated'
  | 'no-warning'
  | 'stale-data'
  | 'feed-error'
  | 'location-error'

export interface ScreenInput {
  ready: boolean
  hasLocation: boolean
  assessment: LocationAssessment
  changes: WarningChange[]
  failure: FeedFailure | null
}

/** Changes worth taking over the screen for. A size change is not one. */
export function significantChanges(changes: WarningChange[]): WarningChange[] {
  return changes.filter(
    (c) => c.kind === 'level-changed' || c.kind === 'new' || c.kind === 'cancelled',
  )
}

/**
 * State precedence, worst case first.
 *
 * An affected location outranks everything: a stale feed or a failed poll
 * never suppresses a warning we already hold. The error states matter only
 * when there is no warning to show.
 */
export function screenStateFrom(input: ScreenInput): ScreenState {
  if (!input.ready) return 'loading'

  const { assessment, changes, failure, hasLocation } = input

  if (assessment.verdict === 'affected') {
    return significantChanges(changes).length > 0 ? 'warning-updated' : 'warning'
  }

  // No location is the user's most fixable problem, so it is named directly
  // rather than folded into a generic "cannot determine".
  if (!hasLocation) return 'location-error'

  if (assessment.verdict === 'unavailable' || failure) return 'feed-error'
  if (assessment.freshness === 'stale') return 'stale-data'
  if (assessment.verdict === 'undetermined') return 'stale-data'

  return 'no-warning'
}

/** Only an escalation earns an assertive interruption. */
export function isEscalation(changes: WarningChange[]): boolean {
  return changes.some((c) => c.kind === 'level-changed' && c.escalated)
}

export function describeChange(changes: WarningChange[]): WarningChange | null {
  const significant = significantChanges(changes)
  const escalation = significant.find((c) => c.kind === 'level-changed' && c.escalated)
  return escalation ?? significant[0] ?? null
}
