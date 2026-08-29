'use client'

import Link from 'next/link'
import { useState } from 'react'
import { packLanguage } from '@/lib/domain/profile'
import { useProfile, usePack } from '@/components/ProfileProvider'
import { useWarnings } from '@/components/WarningProvider'
import { ServiceCard } from '@/components/ServiceCard'
import { CallScriptPanel } from '@/components/CallScriptPanel'
import { Checklist } from '@/components/Checklist'
import { assess } from '@/lib/domain/match'
import { rankServices } from '@/lib/help/services'
import { buildShareMessage, shareSituation } from '@/lib/help/share'

const RFS_FIRES_NEAR_ME = 'https://www.rfs.nsw.gov.au/fire-information/fires-near-me'

export default function HelpPage() {
  const { profile, ready } = useProfile()
  const pack = usePack()
  const { feed, demoMode } = useWarnings()
  const [shareResult, setShareResult] = useState<string | null>(null)

  if (!ready) return <main><p>...</p></main>

  const assessment = assess(feed.warnings, profile.location, feed.freshness)
  const top = assessment.all[0] ?? null

  const services = rankServices({
    level: top?.warning.level ?? null,
    inside: top?.verdict === 'affected',
    profile,
  })

  // One call is almost always the right first move. Leading with six numbers
  // makes someone in danger read a list; leading with one makes them act.
  const [primary, ...others] = services

  return (
    <>
      {demoMode && <div className="banner banner--demo">{pack.ui.demoBanner}</div>}

      <main>
        <h1>{pack.ui.getHelp}</h1>

        {primary && (
          <section className="primary-action stack">
            <h2 lang="en">{primary.name}</h2>
            <p>{primary.descriptions[packLanguage(profile.language)]}</p>
            <a className="button button--danger" href={`tel:${primary.phone}`}>
              {pack.ui.callNow} {primary.phoneDisplay}
            </a>
          </section>
        )}

        {/* Everything below is a deliberate choice, not a wall of options.
            The checklist is open because it is what to do; the rest are
            one tap away. */}
        <details className="card" open>
          <summary><strong>{pack.ui.whatToDo}</strong></summary>
          <Checklist warning={top?.warning ?? null} />
        </details>

        <details className="card">
          <summary><strong>{pack.ui.whatToSay}</strong></summary>
          <CallScriptPanel warning={top?.warning ?? null} />
        </details>

        <details className="card">
          <summary><strong>{pack.ui.otherServices}</strong></summary>
          {others.map((service) => (
            <ServiceCard key={service.id} service={service} />
          ))}
        </details>

        <a
          className="button button--secondary"
          href={top?.warning.officialUrl ?? RFS_FIRES_NEAR_ME}
          target="_blank"
          rel="noreferrer"
        >
          {pack.ui.viewOfficial}
        </a>

        <section className="card stack" style={{ marginTop: 'var(--space-3)' }}>
          <button
            type="button"
            className="button button--secondary"
            onClick={async () => {
              const result = await shareSituation(buildShareMessage(profile, top))
              setShareResult(result)
            }}
          >
            {pack.ui.shareSituation}
          </button>
          {shareResult === 'unsupported' && (
            <div className="official" lang="en">{buildShareMessage(profile, top)}</div>
          )}
        </section>

        <Link className="button button--secondary" href="/">{pack.ui.yourArea}</Link>
      </main>
    </>
  )
}
