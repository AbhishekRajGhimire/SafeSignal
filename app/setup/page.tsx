'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useProfile, usePack } from '@/components/ProfileProvider'
import { OptionGroup, type Option } from '@/components/setup/OptionGroup'
import { PlacePicker } from '@/components/PlacePicker'
import { LANGUAGE_NAMES } from '@/lib/i18n'
import {
  PACK_LANGUAGES,
  type AccessibilityNeed,
  type LanguageCode,
  type TextSize,
  type Transport,
} from '@/lib/domain/profile'

type StepId = 'language' | 'text' | 'audio' | 'needs' | 'transport' | 'location'

const STEPS: StepId[] = ['language', 'text', 'audio', 'needs', 'transport', 'location']

export default function SetupPage() {
  const router = useRouter()
  const { profile, update, ready } = useProfile()
  const pack = usePack()
  const [index, setIndex] = useState(0)
  const [showLocationError, setShowLocationError] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const headingId = useId()
  const firstRender = useRef(true)

  // Move focus to the new question on every step change, so a keyboard or
  // screen-reader user lands on the question rather than at the page top.
  // Skipped on first render: stealing focus on arrival is disorienting.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    headingRef.current?.focus()
  }, [index])

  if (!ready) {
    return (
      <main className="setup">
        <p role="status">{pack.ui.setupIntro}</p>
      </main>
    )
  }

  const step = STEPS[index]
  const isLast = index === STEPS.length - 1

  const languageOptions: Option<LanguageCode>[] = [
    ...PACK_LANGUAGES.map((code) => ({ value: code as LanguageCode, label: LANGUAGE_NAMES[code] })),
    { value: 'other', label: pack.ui.languageOther, note: pack.ui.languageOtherHelp },
  ]

  const textOptions: Option<TextSize>[] = [
    { value: 'standard', label: pack.ui.textStandard },
    { value: 'large', label: pack.ui.textLarge },
    { value: 'x-large', label: pack.ui.textXLarge },
  ]

  const audioOptions: Option<'on' | 'off'>[] = [
    { value: 'on', label: pack.ui.audioOn },
    { value: 'off', label: pack.ui.audioOff },
  ]

  // 'none' is a sentinel for the option group only. It is never stored:
  // "none of these" is represented by an empty needs list.
  type NeedChoice = AccessibilityNeed | 'none'
  const needOptions: Option<NeedChoice>[] = [
    { value: 'mobility', label: pack.ui.needMobility },
    { value: 'low-vision', label: pack.ui.needLowVision },
    { value: 'hearing', label: pack.ui.needHearing },
    { value: 'cognitive', label: pack.ui.needCognitive },
    { value: 'simpler', label: pack.ui.needSimpler },
  ]

  const transportOptions: Option<Transport>[] = [
    { value: 'car', label: pack.ui.transportCar },
    { value: 'public-transport', label: pack.ui.transportPublic },
    { value: 'taxi-rideshare', label: pack.ui.transportTaxi },
    { value: 'accessible-transport', label: pack.ui.transportAccessible },
    { value: 'needs-assistance', label: pack.ui.transportAssistance },
    { value: 'unsure', label: pack.ui.transportUnsure },
  ]

  const QUESTION: Record<StepId, string> = {
    language: pack.ui.qLanguage,
    text: pack.ui.qTextSize,
    audio: pack.ui.qAudio,
    needs: pack.ui.qNeeds,
    transport: pack.ui.qTransport,
    location: pack.ui.qLocation,
  }

  const HELP: Record<StepId, string> = {
    language: pack.ui.qLanguageHelp,
    text: pack.ui.qTextSizeHelp,
    audio: pack.ui.qAudioHelp,
    needs: `${pack.ui.qNeedsHelp} ${pack.ui.selectAllThatApply}`,
    transport: pack.ui.qTransportHelp,
    location: pack.ui.qLocationHelp,
  }

  const goNext = () => {
    // A location is required: without one the app cannot tell which warnings
    // are relevant, and would fall back to showing every warning in NSW.
    if (isLast && !profile.location) {
      setShowLocationError(true)
      return
    }
    if (isLast) {
      update({ completedSetup: true })
      router.push('/')
      return
    }
    setIndex((i) => i + 1)
  }

  return (
    <main className="setup" id="main">
      <h1 style={{ fontSize: 'var(--text-lg)', color: 'var(--ink-muted)', fontWeight: 600 }}>
        {pack.ui.setupTitle}
      </h1>

      <div className="progress">
        {/* The number is the signal. The bar only reinforces it. */}
        <p className="progress__text">
          {pack.ui.stepWord} {index + 1} {pack.ui.ofWord} {STEPS.length}
        </p>
        <div className="progress__track" aria-hidden="true">
          <div
            className="progress__fill"
            style={{ width: `${((index + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="question">
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="question__heading"
          style={{ fontSize: 'var(--text-xl)', lineHeight: 1.25 }}
        >
          {QUESTION[step]}
        </h2>

        {step === 'language' && (
          <OptionGroup
            mode="single"
            name="language"
            labelledBy={headingId}
            help={HELP.language}
            options={languageOptions}
            selected={profile.language}
            onChange={(language) => update({ language })}
          />
        )}

        {step === 'text' && (
          <>
            {/* The sample renders at the size being chosen, not the size in force. */}
            <div className="preview">
              <p className="preview__sample">
                {pack.ui.textPreview}
              </p>
            </div>
            <OptionGroup
              mode="single"
              name="textSize"
              labelledBy={headingId}
              help={HELP.text}
              options={textOptions}
              selected={profile.textSize}
              onChange={(textSize) => update({ textSize })}
            />
          </>
        )}

        {step === 'audio' && (
          <OptionGroup
            mode="single"
            name="audio"
            labelledBy={headingId}
            help={HELP.audio}
            options={audioOptions}
            selected={profile.audio ? 'on' : 'off'}
            onChange={(value) => update({ audio: value === 'on' })}
          />
        )}

        {step === 'needs' && (
          <OptionGroup
            mode="multi"
            name="needs"
            labelledBy={headingId}
            help={HELP.needs}
            options={needOptions}
            noneOption={{ value: 'none', label: pack.ui.needNone }}
            selected={profile.needs}
            onChange={(chosen) =>
              update({ needs: chosen.filter((v): v is AccessibilityNeed => v !== 'none') })
            }
          />
        )}

        {step === 'transport' && (
          <OptionGroup
            mode="single"
            name="transport"
            labelledBy={headingId}
            help={HELP.transport}
            options={transportOptions}
            selected={profile.transport}
            onChange={(transport) => update({ transport })}
          />
        )}

        {step === 'location' && (
          <>
            <p className="question__help" style={{ marginBottom: 'var(--space-3)' }}>
              {HELP.location}
            </p>
            {showLocationError && (
              <p className="notice" role="alert">
                {pack.ui.locationRequired}
              </p>
            )}
            <PlacePicker
              selected={profile.location}
              onSelect={(location) => {
                update({ location })
                setShowLocationError(false)
              }}
            />
          </>
        )}
      </div>

      <div className="setup__nav">
        {index > 0 && (
          <button
            type="button"
            className="button button--secondary"
            onClick={() => setIndex((i) => i - 1)}
          >
            {pack.ui.back}
          </button>
        )}
        <button type="button" className="button" onClick={goNext}>
          {isLast ? pack.ui.finish : pack.ui.next}
        </button>
      </div>

      <p className="reassure">{pack.ui.setupReassure}</p>
    </main>
  )
}
