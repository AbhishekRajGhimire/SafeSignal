'use client'

import { usePack } from '../ProfileProvider'
import type { RenderedWarning } from '@/lib/i18n/render'
import type { Warning } from '@/lib/domain/warning'

/**
 * The official warning, in the issuing authority's own words.
 *
 * Deliberately a different visual register from everything around it: a
 * sunken ground, a rule down the leading edge, a monospace label, and the
 * feed's own uppercase field names. Nothing here is SafeSignal's wording, and
 * it should not be possible to mistake it for SafeSignal's wording.
 *
 * Always `lang="en"`, because that is what it is, whatever language the rest
 * of the screen is in.
 */
export function OfficialBlock({
  view,
  warning,
}: {
  view: RenderedWarning
  warning: Warning
}) {
  const pack = usePack()

  return (
    <section className="official-block">
      <h3 className="official-block__label">
        <span className="official-block__dot" aria-hidden="true" />
        {pack.ui.officialWording}
      </h3>

      <pre className="official-block__text" lang="en">{view.officialText}</pre>

      <p className="official-block__source">
        {warning.provenance.sourceName}
        {view.updatedText && <> · {pack.fields.updated} {view.updatedText}</>}
      </p>

      <a
        className="button button--secondary"
        href={view.officialUrl}
        target="_blank"
        rel="noreferrer"
      >
        {pack.ui.viewOfficial}
      </a>
    </section>
  )
}
