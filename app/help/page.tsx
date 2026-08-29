'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useProfile, usePack } from '@/components/ProfileProvider'
import { useWarnings } from '@/components/WarningProvider'
import { ServiceCard } from '@/components/ServiceCard'
import { CallScriptPanel } from '@/components/CallScriptPanel'
import { Checklist } from '@/components/Checklist'
import { assess } from '@/lib/domain/match'
import { rankServices } from '@/lib/help/services'
import { buildShareMessage, shareSituation } from '@/lib/help/share'

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

  return (
    <>
      {demoMode && <div className="banner banner--demo">{pack.ui.demoBanner}</div>}

      <main>
        <h1>{pack.ui.getHelp}</h1>

        {services.map((service) => (
          <ServiceCard key={service.id} service={service} />
        ))}

        <CallScriptPanel warning={top?.warning ?? null} />

        <Checklist warning={top?.warning ?? null} />

        <section className="card stack">
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
          {shareResult === 'copied' && <p className="muted">Copied to clipboard.</p>}
          {shareResult === 'unsupported' && (
            <div className="official" lang="en">{buildShareMessage(profile, top)}</div>
          )}
        </section>

        <Link className="button button--secondary" href="/">{pack.ui.yourArea}</Link>
      </main>
    </>
  )
}
