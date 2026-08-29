'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useProfile, usePack } from '@/components/ProfileProvider'
import { useWarnings } from '@/components/WarningProvider'
import { CallAction } from '@/components/help/CallAction'
import { ServiceRow } from '@/components/help/ServiceRow'
import { Disclosure } from '@/components/help/Disclosure'
import { CallScriptPanel } from '@/components/CallScriptPanel'
import { Checklist } from '@/components/Checklist'
import { assess } from '@/lib/domain/match'
import { rankServices } from '@/lib/help/services'
import { buildShareMessage, shareSituation } from '@/lib/help/share'

const RFS_FIRES_NEAR_ME = 'https://www.rfs.nsw.gov.au/fire-information/fires-near-me'

export default function HelpPage() {
  const { profile, ready } = useProfile()
  const pack = usePack()
  const { feed, demoMode, demoAnchor } = useWarnings()
  const [shareResult, setShareResult] = useState<string | null>(null)

  if (!ready) {
    return (
      <main className="screen">
        <p role="status">{pack.ui.loadingTitle}</p>
      </main>
    )
  }

  // Matches the warning screen: in demo mode the scenarios are anchored to
  // the demo place, so relevance is assessed against the same point.
  const assessedAt = profile.location ?? (demoMode ? demoAnchor : null)
  const assessment = assess(feed.warnings, assessedAt, feed.freshness)
  const top = assessment.all[0] ?? null

  const services = rankServices({
    level: top?.warning.level ?? null,
    inside: top?.verdict === 'affected',
    profile,
  })

  // One call is almost always the right first move.
  const [primary, ...others] = services

  return (
    <>
      {demoMode && <div className="banner banner--demo">{pack.ui.demoBanner}</div>}

      <main className="screen" id="main">
        <header className="screen__head">
          <h1>{pack.ui.getHelp}</h1>
          {assessedAt && <p className="lede">{assessedAt.label}</p>}
        </header>

        {primary && <CallAction service={primary} />}

        {/* What to do is open, because it is the answer. Everything else is
            a deliberate second step rather than a wall of options. */}
        <Disclosure title={pack.ui.whatToDo} open>
          <Checklist warning={top?.warning ?? null} />
        </Disclosure>

        <Disclosure title={pack.ui.whatToSay}>
          <CallScriptPanel warning={top?.warning ?? null} />
        </Disclosure>

        <Disclosure title={pack.ui.otherServices}>
          <div className="services">
            {others.map((service) => (
              <ServiceRow key={service.id} service={service} />
            ))}
          </div>
        </Disclosure>

        <Disclosure title={pack.ui.shareSituation}>
          <div className="share">
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
            {/* When the device cannot share, the message is shown so it can
                be copied by hand rather than lost. */}
            {shareResult === 'unsupported' && (
              <pre className="message__official" lang="en">
                {buildShareMessage(profile, top)}
              </pre>
            )}
          </div>
        </Disclosure>

        <footer className="screen__foot">
          <p>{pack.ui.sourceRfs}</p>
          <div className="screen__actions">
            <a
              className="button button--secondary"
              href={top?.warning.officialUrl ?? RFS_FIRES_NEAR_ME}
              target="_blank"
              rel="noreferrer"
            >
              {pack.ui.viewOfficial}
            </a>
            <Link className="button button--secondary" href="/">
              {pack.ui.yourArea}
            </Link>
          </div>
        </footer>
      </main>
    </>
  )
}
