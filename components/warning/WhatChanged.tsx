'use client'

import { usePack, useProfile } from '../ProfileProvider'
import { renderChangeSummary } from '@/lib/i18n/changes'
import type { ChangeDetail } from '@/lib/domain/changeSummary'

/**
 * "Warning updated" and, beneath it, what actually changed.
 *
 * Every line is derived from the official data: the level from the feed's
 * category, statuses from its STATUS field, sizes from SIZE, the area from
 * its own geometry. When something changed that cannot be confidently
 * described, the line is "Official warning updated." and the latest official
 * message below the summary carries the substance.
 *
 * No line is ever an instruction. What to do comes from the level action
 * and the official advice, not from the fact of a change.
 */
export function WhatChanged({
  details,
  assertive,
}: {
  details: ChangeDetail[]
  assertive: boolean
}) {
  const pack = usePack()
  const { profile } = useProfile()
  const lines = renderChangeSummary(details, profile.language)

  return (
    <section
      className="updated"
      role="status"
      aria-live={assertive ? 'assertive' : 'polite'}
    >
      <h2 className="updated__title">
        <span className="updated__mark" aria-hidden="true">↻</span>
        {pack.ui.warningUpdatedTitle}
      </h2>
      <h3 className="updated__question">{pack.ui.whatChanged}</h3>
      <ul className="updated__list">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  )
}
