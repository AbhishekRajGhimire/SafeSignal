'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { useProfile, usePack } from '@/components/ProfileProvider'
import { useWarnings } from '@/components/WarningProvider'
import { EmergencyWarning } from '@/components/warning/EmergencyWarning'
import { WarningSummary } from '@/components/warning/WarningSummary'
import {
  FeedErrorPanel,
  LoadingPanel,
  LocationErrorPanel,
  NoWarningPanel,
  StaleDataPanel,
} from '@/components/warning/StatePanel'
import { DemoControls } from '@/components/DemoControls'
import { assess } from '@/lib/domain/match'
import { screenStateFrom, isEscalation } from '@/lib/domain/screenState'
import { summariseWarningChange } from '@/lib/domain/changeSummary'
import { WhatChanged } from '@/components/warning/WhatChanged'
import { renderWarning } from '@/lib/i18n/render'
import { speechLocaleOf } from '@/lib/i18n'
import type { LanguageCode } from '@/lib/domain/profile'
import { getSpeechEngine } from '@/lib/speech/tts'

const clockFor = (language: LanguageCode) =>
  new Intl.DateTimeFormat(speechLocaleOf(language), {
    timeZone: 'Australia/Sydney',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

export default function Home() {
  const { profile, ready } = useProfile()
  const pack = usePack()
  const { feed, demoMode, setDemoMode, demoAnchor } = useWarnings()

  // In demo mode the scenarios are built around the demo anchor, so
  // relevance is assessed against the same point. Otherwise a cold
  // ?demo=1 places a fire around Katoomba and then reports that it does
  // not know where the user is.
  const assessedAt = profile.location ?? (demoMode ? demoAnchor : null)
  const assessment = assess(feed.warnings, assessedAt, feed.freshness)
  const state = screenStateFrom({
    ready,
    hasLocation: assessedAt !== null,
    assessment,
    changes: feed.changes,
    failure: feed.failure,
  })

  const top = assessment.affected[0] ?? null
  const topId = top?.warning.id ?? null
  const topLevel = top?.warning.level ?? null

  // Read the most urgent warning aloud when the user asked for audio.
  // Keyed on id and level so an escalation re-speaks, but a poll does not.
  useEffect(() => {
    if (!profile.audio || !top) return
    const view = renderWarning(top, profile.language)
    getSpeechEngine()?.speak(view.speechText, view.speechLocale)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topId, topLevel, profile.audio, profile.language])

  if (state === 'loading') {
    return (
      <main className="screen">
        <LoadingPanel />
      </main>
    )
  }

  // Demo mode bypasses the setup gate on purpose. Someone opening the shared
  // link cold must land on the scenario, not on a settings wizard.
  if (!profile.completedSetup && !demoMode) {
    return (
      <main className="screen screen--intro">
        <h1>SafeSignal</h1>
        <p className="lede">{pack.ui.setupIntro}</p>
        <Link className="button" href="/setup">{pack.ui.saveAndContinue}</Link>
        <button
          type="button"
          className="button button--secondary"
          onClick={() => setDemoMode(true)}
        >
          {pack.ui.switchToDemo}
        </button>
      </main>
    )
  }

  const emergency = state === 'warning' || state === 'warning-updated'
  const others = assessment.all.filter((r) => r.verdict !== 'affected')

  return (
    <>
      {demoMode && <div className="banner banner--demo">{pack.ui.demoBanner}</div>}

      <main className={`screen${emergency ? ' screen--emergency' : ''}`} id="main">
        {/* The change summary is the one interruption the screen allows.
            It says what changed; it never says what to do about it. */}
        {state === 'warning-updated' && top && (
          <WhatChanged
            details={summariseWarningChange(
              feed.previous.find((w) => w.id === top.warning.id),
              top.warning,
            )}
            assertive={isEscalation(feed.changes)}
          />
        )}

        {emergency && top ? (
          assessment.affected.map((item) => (
            <EmergencyWarning key={item.warning.id} relevant={item} />
          ))
        ) : (
          <>
            <header className="screen__head">
              <h1>{pack.ui.yourArea}</h1>
              {assessedAt && <p className="lede">{assessedAt.label}</p>}
            </header>

            {state === 'no-warning' && <NoWarningPanel />}
            {state === 'stale-data' && <StaleDataPanel />}
            {state === 'feed-error' && <FeedErrorPanel />}
            {state === 'location-error' && <LocationErrorPanel />}
          </>
        )}

        {others.length > 0 && (
          <section className="others">
            <h2 className="others__title">{pack.ui.otherWarnings}</h2>
            {others.map((item) => (
              <WarningSummary key={item.warning.id} relevant={item} />
            ))}
          </section>
        )}

        {demoMode && <DemoControls />}

        {/* Freshness is never optional: silent staleness is the dangerous
            failure, so it sits on every screen regardless of state. */}
        <footer className="screen__foot">
          <p className="muted">
            {pack.ui.dataAsOf} {feed.fetchedAt ? clockFor(profile.language).format(feed.fetchedAt) : '—'}
          </p>
          <p className="muted">{pack.ui.sourceRfs}</p>
          <div className="screen__actions">
            <Link className="button button--secondary" href="/setup">
              {pack.ui.changeSettings}
            </Link>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => setDemoMode(!demoMode)}
            >
              {demoMode ? pack.ui.switchToLive : pack.ui.switchToDemo}
            </button>
          </div>
        </footer>
      </main>
    </>
  )
}
