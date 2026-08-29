'use client'

import { usePack } from './ProfileProvider'
import type { LocationAssessment, VerdictReason } from '@/lib/domain/relevance'

/**
 * States the answer to "does this affect my location?" in one place, for all
 * four possible answers.
 *
 * The negative case is never phrased as safety. SafeSignal can say that no
 * official warning covers a location; it cannot say a person is safe, because
 * a bushfire warning is not the only hazard a person faces and the feed is
 * not the only thing that can change.
 */
export function LocationStatus({ assessment }: { assessment: LocationAssessment }) {
  const pack = usePack()

  const REASON: Partial<Record<VerdictReason, string>> = {
    'no-location': pack.ui.reasonNoLocation,
    'point-only': pack.ui.reasonNoMapArea,
    'no-geometry': pack.ui.reasonNoMapArea,
    'invalid-geometry': pack.ui.reasonUnreadableArea,
    'stale-data': pack.ui.reasonOutOfDate,
    'no-warning-data': pack.ui.reasonNoData,
  }

  const explanation = REASON[assessment.reason]

  if (assessment.verdict === 'affected') {
    return (
      <section className="status status--affected" aria-live="assertive">
        <h2 className="status__title">
          <span className="status__mark" aria-hidden="true">▲</span>
          {pack.ui.statusAffected}
        </h2>
      </section>
    )
  }

  if (assessment.verdict === 'not-currently-affected') {
    return (
      <section className="status status--negative" aria-live="polite">
        <h2 className="status__title">
          <span className="status__mark" aria-hidden="true">●</span>
          {pack.ui.statusNotAffected}
        </h2>
        {/* Explicitly not an all-clear. */}
        <p className="status__body">{pack.ui.statusNotAffectedBody}</p>
      </section>
    )
  }

  const unavailable = assessment.verdict === 'unavailable'

  return (
    <section className="status status--unknown" aria-live="polite">
      <h2 className="status__title">
        <span className="status__mark" aria-hidden="true">◆</span>
        {unavailable ? pack.ui.statusUnavailable : pack.ui.statusUndetermined}
      </h2>
      {explanation && <p className="status__body">{explanation}</p>}
      {/* When we cannot answer, point at who can. */}
      <a
        className="button button--secondary"
        href="https://www.rfs.nsw.gov.au/fire-information/fires-near-me"
        target="_blank"
        rel="noreferrer"
      >
        {pack.ui.checkOfficial}
      </a>
    </section>
  )
}
