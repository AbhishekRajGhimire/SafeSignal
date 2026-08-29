'use client'

import { useState } from 'react'
import { useProfile } from './ProfileProvider'
import { buildCallScript, type HelpNeed } from '@/lib/help/callScript'
import type { Warning } from '@/lib/domain/warning'

export function CallScriptPanel({ warning }: { warning: Warning | null }) {
  const { profile } = useProfile()
  const [need, setNeed] = useState<HelpNeed>('evacuate')
  const script = buildCallScript(profile, warning, need)

  // Shown in the user's own language so they can pick what they need.
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
    <section className="card stack">

      {needs.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`choice${need === option.value ? ' choice--selected' : ''}`}
          style={{ width: '100%', textAlign: 'left' }}
          onClick={() => setNeed(option.value)}
        >
          {option.label}
        </button>
      ))}

      {/* English to read aloud or show the operator. */}
      <div className="official" lang="en">
        {script.english.join('\n')}
      </div>

      {/* The same sentences, so the caller knows what they are saying. */}
      {profile.language !== 'en' && (
        <div className="card" style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>
          {script.translated.join('\n')}
        </div>
      )}
    </section>
  )
}
