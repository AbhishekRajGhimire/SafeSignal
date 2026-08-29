'use client'

import Link from 'next/link'
import { AlertBadge } from './AlertBadge'
import { SpeakButton } from './SpeakButton'
import { usePack, useProfile } from './ProfileProvider'
import { useSimplifiedAdvice } from './useSimplifiedAdvice'
import { renderWarning } from '@/lib/i18n/render'
import type { RelevantWarning } from '@/lib/domain/match'

export function WarningCard({ relevant }: { relevant: RelevantWarning }) {
  const { profile } = useProfile()
  const pack = usePack()
  const view = renderWarning(relevant, profile.language)
  const simplified = useSimplifiedAdvice(relevant.warning.rawAdvice, profile.language)

  return (
    <article className="card stack">
      <AlertBadge level={relevant.warning.level} label={view.levelName} />

      {/* The plain meaning is the headline. The official label is the badge. */}
      <h2>{view.levelMeaning}</h2>

      {/* Place names stay in English so they can be matched to a road sign or
          read to a 000 operator. The label is translated so the reader knows
          what the English text is. */}
      <dl className="facts">
        <dt>{pack.fields.location}</dt>
        <dd lang="en">{view.placeText}</dd>

        {view.councilText && (
          <>
            <dt>{pack.fields.council}</dt>
            <dd lang="en">{view.councilText}</dd>
          </>
        )}

        {view.distanceText && (
          <>
            <dt>{pack.ui.yourArea}</dt>
            <dd>{view.distanceText}</dd>
          </>
        )}

        <dt>{pack.fields.status}</dt>
        <dd>{view.statusText}</dd>

        {view.typeText && (
          <>
            <dt>{pack.fields.size}</dt>
            <dd>{view.typeText}{view.sizeText ? ` · ${view.sizeText}` : ''}</dd>
          </>
        )}

        {view.updatedText && (
          <>
            <dt>{pack.fields.updated}</dt>
            <dd>{view.updatedText}</dd>
          </>
        )}
      </dl>

      <p><strong>{view.levelAction}</strong></p>

      {simplified && (
        <div className="card" style={{ marginBottom: 0 }}>
          <p>{simplified}</p>
          <p className="muted">{pack.ui.sourceRfs}</p>
        </div>
      )}

      <SpeakButton text={view.speechText} locale={view.speechLocale} />

      <details>
        <summary>{pack.ui.officialWording}</summary>
        <div className="official" lang="en">{view.officialText}</div>
        <p className="muted">{pack.ui.sourceRfs}</p>
        <a className="button button--secondary" href={view.officialUrl} target="_blank" rel="noreferrer">
          {pack.ui.viewOfficial}
        </a>
      </details>

      <Link className="button button--danger" href="/help">{pack.ui.getHelp}</Link>
    </article>
  )
}
