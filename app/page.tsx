'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { useProfile, usePack } from '@/components/ProfileProvider'
import { useWarnings } from '@/components/WarningProvider'
import { WarningCard } from '@/components/WarningCard'
import { DemoControls } from '@/components/DemoControls'
import { assess } from '@/lib/domain/match'
import { LocationStatus } from '@/components/LocationStatus'
import { renderWarning } from '@/lib/i18n/render'
import { speak } from '@/lib/speech/tts'

const sydneyTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Australia/Sydney',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

export default function Home() {
  const { profile, ready } = useProfile()
  const pack = usePack()
  const { feed, demo, demoState, demoMode, setDemoMode } = useWarnings()

  // One assessment answers "does this affect my location?" for every warning,
  // and the four possible answers are distinguished on screen.
  const assessment = assess(feed.warnings, profile.location, feed.freshness)
  const relevant = assessment.all
  const top = relevant[0] ?? null
  const topId = top?.warning.id ?? null
  const topLevel = top?.warning.level ?? null

  // Read the most urgent warning aloud when the user asked for audio.
  // Keyed on id and level so an escalation re-speaks, but a poll does not.
  useEffect(() => {
    if (!profile.audio || !top) return
    const view = renderWarning(top, profile.language)
    void speak(view.speechText, view.speechLocale)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topId, topLevel, profile.audio, profile.language])

  if (!ready) return <main><p>...</p></main>

  // Demo mode bypasses the setup gate on purpose. Someone opening the shared
  // link cold must land on the scenario, not on a settings wizard.
  if (!profile.completedSetup && !demoMode) {
    return (
      <main className="stack">
        <h1>SafeSignal</h1>
        <p>{pack.ui.setupIntro}</p>
        <Link className="button" href="/setup">{pack.ui.saveAndContinue}</Link>
        <button
          type="button"
          className="button button--secondary"
          onClick={() => setDemoMode(true)}
        >
          Demo mode
        </button>
      </main>
    )
  }

  return (
    <>
      {demoMode && <div className="banner banner--demo">{pack.ui.demoBanner}</div>}
      {feed.stale && <div className="banner banner--offline">{pack.ui.offlineNotice}</div>}

      <main>
        <h1>{pack.ui.yourArea}</h1>
        <p className="muted">{profile.location?.label ?? ''}</p>

        {demo && demoState && <DemoControls demo={demo} state={demoState} />}

        {/* The verdict comes first: it is the question the user actually has. */}
        <LocationStatus assessment={assessment} />

        {/* When the location is affected, the official warning follows. */}
        {relevant.length === 0 ? (
          assessment.verdict === 'not-currently-affected' && (
            <div className="card">
              <h2>{pack.ui.noWarningsTitle}</h2>
              <p>{pack.ui.noWarningsBody}</p>
            </div>
          )
        ) : (
          relevant.map((item) => <WarningCard key={item.warning.id} relevant={item} />)
        )}

        {/* Freshness is never optional: silent staleness is the dangerous failure. */}
        <p className="muted">
          {pack.ui.dataAsOf} {feed.fetchedAt ? sydneyTime.format(feed.fetchedAt) : '-'}
        </p>

        <div className="stack">
          <Link className="button button--secondary" href="/setup">{pack.ui.changeSettings}</Link>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => setDemoMode(!demoMode)}
          >
            {demoMode ? 'Live mode' : 'Demo mode'}
          </button>
        </div>
      </main>
    </>
  )
}
