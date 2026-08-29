'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { revealEmergency } from '@/lib/motion/reveal'
import { OfficialBlock } from './OfficialBlock'
import { ProximityDiagram } from './ProximityDiagram'
import { SpeechControls } from '../speech/SpeechControls'
import { usePack, useProfile } from '../ProfileProvider'
import { renderWarning } from '@/lib/i18n/render'
import type { RelevantWarning } from '@/lib/domain/match'

/**
 * The focused emergency experience, shown when a warning covers the user's
 * location.
 *
 * Ordered by the questions a person actually asks, in the order they ask
 * them: what is happening, does it affect me, what must I do, what did the
 * authority actually say, can I hear it, and how do I get help.
 *
 * Colour is restrained to roughly a tenth of the surface: the level band, the
 * rule under the heading, and the help action. The alert level is carried by
 * a word and a shape as well as that colour.
 */
export function EmergencyWarning({ relevant }: { relevant: RelevantWarning }) {
  const root = useRef<HTMLElement>(null)
  const { profile } = useProfile()
  const pack = usePack()
  const view = renderWarning(relevant, profile.language)
  const level = relevant.warning.level

  // Re-runs when the level changes, so an escalation settles in the same
  // way a new warning does. Reverted on unmount and under reduced motion.
  useEffect(() => {
    if (!root.current) return
    return revealEmergency(root.current)
  }, [level, relevant.warning.id])

  return (
    <article ref={root} className={`emergency emergency--${level}`}>
      {/* 1. What is happening. The official label, unmistakable. */}
      <div className="emergency__band">
        <span className="emergency__shape" aria-hidden="true">
          {level === 'emergency-warning' ? '▲' : level === 'watch-and-act' ? '◆' : '●'}
        </span>
        <span className="emergency__level">{view.levelName}</span>
      </div>

      <div className="emergency__body">
        {/* The plain meaning is the headline, not the jargon. */}
        <h1 className="emergency__meaning">{view.levelMeaning}</h1>

        {/* 2. Does it affect me. */}
        <p className="emergency__place">
          <strong>{view.placeText}</strong>
          {relevant.inside && <span className="emergency__here">{pack.ui.youAreInside}</span>}
        </p>

        <p className="emergency__status">{view.statusText}</p>

        {/* The same relationship as the sentence above, drawn. */}
        <ProximityDiagram relevant={relevant} />

        {/* 3. What must I do. Given its own weight, not a fourth paragraph. */}
        <div className="emergency__action">
          <p className="emergency__action-label">{pack.ui.whatToDo}</p>
          <p className="emergency__action-text">{view.levelAction}</p>
        </div>

        {/* 5. Can I hear it. */}
        <SpeechControls text={view.speechText} locale={view.speechLocale} />

        {/* 4 and 7. What the authority said, and where it came from. */}
        <OfficialBlock view={view} warning={relevant.warning} />

        {/* 8. The official assistance pathway. Pinned within thumb reach,
            because it is what the screen is for. */}
        <div className="emergency__cta">
          <Link className="button button--help" href="/help">
            {pack.ui.getHelp}
          </Link>
        </div>
      </div>
    </article>
  )
}
