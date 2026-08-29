'use client'

import { usePack, useProfile } from '../ProfileProvider'
import { useTranslation } from '../useTranslation'
import { isTranslatable } from '@/lib/i18n/translation'
import type { RenderedWarning } from '@/lib/i18n/render'
import type { Warning } from '@/lib/domain/warning'

/**
 * The official message and, beneath it, SafeSignal's accessible explanation.
 *
 * Three labelled parts, always in this order:
 *
 *   OFFICIAL MESSAGE        the issuing authority's own words, verbatim
 *   SAFESIGNAL EXPLANATION  translated and simplified, clearly marked as ours
 *   SOURCE                  NSW Rural Fire Service
 *
 * The official message is always present. The explanation is additive: when
 * translation is unavailable, rejected, or simply not applicable, the
 * official message stands alone and the interface says why rather than
 * pretending nothing was attempted.
 *
 * The two registers are deliberately unalike. Official text is monospace on
 * a sunken ground behind a solid rule, always lang="en" and always left to
 * right. SafeSignal's explanation is sans, on paper, behind a dashed rule,
 * in the reader's own language. They must never be mistaken for each other.
 */
export function OfficialBlock({
  view,
  warning,
}: {
  view: RenderedWarning
  warning: Warning
}) {
  const pack = usePack()
  const { profile } = useProfile()

  // Only free text the RFS itself wrote is ever sent for translation.
  const outcome = useTranslation(warning.rawAdvice, profile.language)
  const wantsTranslation = isTranslatable(profile.language) && warning.rawAdvice !== null

  return (
    <section className="message">
      {/* ---- Official, verbatim ---- */}
      <div className="message__part message__part--official">
        <h3 className="message__label message__label--official">
          <span className="message__dot" aria-hidden="true" />
          {pack.ui.officialMessageLabel}
        </h3>
        <pre className="message__official" lang="en">{view.officialText}</pre>
      </div>

      {/* ---- SafeSignal's explanation, only ever additive ---- */}
      {wantsTranslation && (
        <div className="message__part message__part--explanation">
          <h3 className="message__label message__label--explanation">
            {pack.ui.explanationLabel}
          </h3>

          {outcome?.status === 'translated' ? (
            <>
              <p className="message__explanation">{outcome.text}</p>
              <p className="message__note">{pack.ui.explanationNote}</p>
            </>
          ) : (
            // Never fabricated, never partially shown. Says so plainly.
            <p className="message__note" role="status">
              {pack.ui.translationUnavailable}
            </p>
          )}
        </div>
      )}

      {/* ---- Attribution ---- */}
      <div className="message__part message__part--source">
        <h3 className="message__label">{pack.ui.sourceLabel}</h3>
        <p className="message__source">
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
      </div>
    </section>
  )
}
