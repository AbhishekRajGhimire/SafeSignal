'use client'

import Link from 'next/link'
import { useProfile, usePack } from './ProfileProvider'
import { LANGUAGE_NAMES } from '@/lib/i18n'
import { PACK_LANGUAGES, type LanguageCode } from '@/lib/domain/profile'

/**
 * The first screen a new visitor sees.
 *
 * Its job is to say who SafeSignal is for, and it does that by being usable
 * before it is readable. The language buttons carry native script only: a
 * person who reads no English recognises their own writing and taps it, and
 * everything else on the screen re-renders in their language. A paragraph
 * explaining that the app serves people with limited English would, to those
 * same people, be another paragraph they cannot read.
 *
 * The conditions below are written as "if you...", not as labels for groups
 * of people. Each one maps to a question the setup screen actually asks, so
 * the claim is backed by the product rather than asserted about the user.
 *
 * Demo mode skips this screen on purpose: ?demo=1 must land on the warning,
 * not on a settings wizard.
 */
export function IntroScreen({ onDemo }: { onDemo: () => void }) {
  const { profile, update } = useProfile()
  const pack = usePack()

  const languages: { value: LanguageCode; label: string }[] = [
    ...PACK_LANGUAGES.map((code) => ({ value: code as LanguageCode, label: LANGUAGE_NAMES[code] })),
    { value: 'other', label: pack.ui.languageOther },
  ]

  return (
    <main className="screen screen--intro">
      <h1 className="intro__name">SafeSignal</h1>
      <p className="lede">{pack.ui.introTagline}</p>

      <h2 className="intro__label" id="intro-language">{pack.ui.introChooseLanguage}</h2>
      <div className="intro__languages" role="group" aria-labelledby="intro-language">
        {languages.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            lang={value === 'other' ? undefined : value}
            className={`choice intro__language${
              value === profile.language ? ' choice--selected' : ''
            }`}
            aria-pressed={value === profile.language}
            onClick={() => update({ language: value })}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="intro__for" aria-labelledby="intro-for">
        <h2 className="intro__label" id="intro-for">{pack.ui.introForTitle}</h2>
        <ul className="intro__list">
          <li>{pack.ui.introForLanguage}</li>
          <li>{pack.ui.introForText}</li>
          <li>{pack.ui.introForHelp}</li>
        </ul>
      </section>

      <Link className="button" href="/setup">{pack.ui.saveAndContinue}</Link>
      <button type="button" className="button button--secondary" onClick={onDemo}>
        {pack.ui.switchToDemo}
      </button>

      {/* Privacy is part of what makes the setup questions answerable. */}
      <p className="intro__reassure">{pack.ui.setupReassure}</p>
    </main>
  )
}
