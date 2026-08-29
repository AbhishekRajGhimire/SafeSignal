'use client'

import { useState } from 'react'
import { useProfile, usePack } from './ProfileProvider'
import { buildCallScript, type HelpNeed } from '@/lib/help/callScript'
import type { Warning } from '@/lib/domain/warning'

/**
 * What to say when you call.
 *
 * Two registers, deliberately unalike, and the same distinction the warning
 * screen draws between official wording and SafeSignal's explanation:
 *
 *   what the operator hears   English, monospace, sunken, lang="en"
 *   what you are saying       your own language, on paper
 *
 * The reason for showing both is that a caller reading a script they cannot
 * read is worse than no script at all.
 */
export function CallScriptPanel({ warning }: { warning: Warning | null }) {
  const { profile } = useProfile()
  const pack = usePack()
  const [need, setNeed] = useState<HelpNeed>('evacuate')
  const script = buildCallScript(profile, warning, need)

  // Offered in the caller's own language, so the choice is readable.
  const needs: { value: HelpNeed; label: string }[] = [
    { value: 'evacuate', label: script.translated[0] },
    {
      value: 'information',
      label: buildCallScript(profile, warning, 'information').translated[0],
    },
    {
      value: 'check-on-me',
      label: buildCallScript(profile, warning, 'check-on-me').translated[0],
    },
  ]

  return (
    <div className="script">
      <div className="script__needs" role="group" aria-label={pack.ui.whatToSay}>
        {needs.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`choice${need === option.value ? ' choice--selected' : ''}`}
            aria-pressed={need === option.value}
            onClick={() => setNeed(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="message__part message__part--official">
        <h3 className="message__label message__label--official">
          <span className="message__dot" aria-hidden="true" />
          English
        </h3>
        <pre className="message__official" lang="en" dir="ltr">{script.english.join('\n')}</pre>
      </div>

      {profile.language !== 'en' && (
        <div className="message__part message__part--explanation">
          <h3 className="message__label message__label--explanation">
            {pack.ui.explanationLabel}
          </h3>
          <p className="script__translated">{script.translated.join('\n')}</p>
        </div>
      )}
    </div>
  )
}
