'use client'

import Link from 'next/link'
import { usePack } from '../ProfileProvider'

type Tone = 'calm' | 'attention' | 'neutral'

/**
 * The shared shell for every non-emergency state.
 *
 * Each state carries a shape, a heading and a sentence. Tone changes the
 * rule colour only, never the meaning: a screen reader, a colour-blind
 * reader and a phone at minimum brightness all get the same information.
 */
export function StatePanel({
  tone,
  shape,
  title,
  body,
  children,
  live,
}: {
  tone: Tone
  shape: string
  title: string
  body?: string
  children?: React.ReactNode
  live?: 'polite' | 'assertive'
}) {
  return (
    <section className={`panel panel--${tone}`} aria-live={live}>
      <h2 className="panel__title">
        <span className="panel__shape" aria-hidden="true">{shape}</span>
        <span>{title}</span>
      </h2>
      {body && <p className="panel__body">{body}</p>}
      {children}
    </section>
  )
}

/** Shown while the stored profile is still being read. */
export function LoadingPanel() {
  const pack = usePack()
  return (
    <section className="panel panel--neutral" aria-busy="true" aria-live="polite">
      <h2 className="panel__title">
        <span className="panel__shape panel__shape--pulse" aria-hidden="true">●</span>
        <span>{pack.ui.loadingTitle}</span>
      </h2>
    </section>
  )
}

export function NoWarningPanel() {
  const pack = usePack()
  return (
    <StatePanel
      tone="calm"
      shape="●"
      title={pack.ui.statusNotAffected}
      body={pack.ui.statusNotAffectedBody}
      live="polite"
    />
  )
}

export function StaleDataPanel({ explanation }: { explanation?: string }) {
  const pack = usePack()
  return (
    <StatePanel
      tone="attention"
      shape="◆"
      title={pack.ui.statusUndetermined}
      body={explanation ?? pack.ui.reasonOutOfDate}
      live="polite"
    >
      <OfficialLink />
    </StatePanel>
  )
}

export function FeedErrorPanel() {
  const pack = usePack()
  return (
    <StatePanel
      tone="attention"
      shape="◆"
      title={pack.ui.statusUnavailable}
      body={pack.ui.reasonNoData}
      live="polite"
    >
      <OfficialLink />
    </StatePanel>
  )
}

export function LocationErrorPanel() {
  const pack = usePack()
  return (
    <StatePanel
      tone="neutral"
      shape="◆"
      title={pack.ui.statusUndetermined}
      body={pack.ui.reasonNoLocation}
    >
      {/* The one thing the user can actually fix, offered directly. */}
      <Link className="button" href="/setup">{pack.ui.qLocation}</Link>
    </StatePanel>
  )
}

function OfficialLink() {
  const pack = usePack()
  return (
    <a
      className="button button--secondary"
      href="https://www.rfs.nsw.gov.au/fire-information/fires-near-me"
      target="_blank"
      rel="noreferrer"
    >
      {pack.ui.checkOfficial}
    </a>
  )
}
