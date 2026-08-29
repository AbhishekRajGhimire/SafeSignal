'use client'

import { usePack, useProfile } from '../ProfileProvider'
import { renderWarning } from '@/lib/i18n/render'
import type { RelevantWarning } from '@/lib/domain/match'

/**
 * A warning that does not cover the user's location, or that we could not
 * assess. Compact on purpose: it must not compete with a warning that does.
 */
export function WarningSummary({ relevant }: { relevant: RelevantWarning }) {
  const { profile } = useProfile()
  const pack = usePack()
  const view = renderWarning(relevant, profile.language)
  const unknown = relevant.verdict === 'undetermined'

  return (
    <article className={`summary summary--${relevant.warning.level}`}>
      <p className="summary__level">
        <span aria-hidden="true">
          {relevant.warning.level === 'emergency-warning' ? '▲'
            : relevant.warning.level === 'watch-and-act' ? '◆' : '●'}
        </span>{' '}
        {view.levelName}
      </p>
      <h3 className="summary__place">{view.placeText}</h3>
      {view.distanceText && <p className="summary__distance">{view.distanceText}</p>}
      {/* An unassessable warning says so, rather than reading as an all-clear. */}
      {unknown && <p className="summary__unknown">{pack.ui.statusUndetermined}</p>}
    </article>
  )
}
