'use client'

import { useWarnings } from './WarningProvider'
import { useProfile } from './ProfileProvider'
import { LANGUAGE_IN_ENGLISH, LANGUAGE_NAMES } from '@/lib/i18n'
import { stopSpeaking } from '@/lib/speech/tts'
import {
  PACK_LANGUAGES,
  TEXT_SIZES,
  type LanguageCode,
  type TextSize,
} from '@/lib/domain/profile'

/**
 * Presenter controls. English on purpose: this panel is for the person
 * giving the demonstration, never for the person the product serves, and it
 * only renders in demo mode - which is banner-labelled as simulated.
 */

/**
 * Native name first, English name second, so the presenter can point at a
 * button while the audience reads what it is. English needs no gloss.
 */
const LANGUAGE_BUTTONS: { value: LanguageCode; label: string }[] = [
  ...PACK_LANGUAGES.map((code) => ({
    value: code as LanguageCode,
    label:
      LANGUAGE_NAMES[code] === LANGUAGE_IN_ENGLISH[code]
        ? LANGUAGE_NAMES[code]
        : `${LANGUAGE_NAMES[code]} · ${LANGUAGE_IN_ENGLISH[code]}`,
  })),
  // Worth demonstrating: the honest fallback promotes the free interpreter
  // line rather than pretending to render a language we do not have.
  { value: 'other', label: 'Not listed' },
]

const TEXT_SIZE_LABELS: Record<TextSize, string> = {
  standard: 'Standard',
  large: 'Large',
  'x-large': 'X-large',
}

export function DemoControls() {
  const { demo, demoState, scenarios, scenarioId, selectScenario, resetDemo } = useWarnings()
  const { profile, update } = useProfile()
  if (!demo || !demoState) return null

  const multiStep = demoState.totalSteps > 1

  const toggleAudio = () => {
    // Switching audio off has to silence what is already being read, or the
    // phone keeps talking over the presenter who just turned it off.
    if (profile.audio) stopSpeaking()
    update({ audio: !profile.audio })
  }

  return (
    <section className="democtl" aria-label="Demo controls">
      <h2 className="democtl__title">Demo scenarios</h2>

      <div className="democtl__scenarios">
        {scenarios.map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            className={`choice${scenario.id === scenarioId ? ' choice--selected' : ''}`}
            aria-pressed={scenario.id === scenarioId}
            onClick={() => selectScenario(scenario.id)}
          >
            {scenario.name}
          </button>
        ))}
      </div>

      {multiStep && (
        <div className="democtl__row">
          <button
            type="button"
            className="button button--secondary"
            onClick={() => (demoState.playing ? demo.pause() : demo.play())}
          >
            {demoState.playing ? 'Pause' : 'Play'}
          </button>

          {/* Lets a presenter jump straight to any step. */}
          {Array.from({ length: demoState.totalSteps }, (_, index) => (
            <button
              key={index}
              type="button"
              className={`button ${index === demoState.stepIndex ? '' : 'button--secondary'}`}
              aria-label={`Go to step ${index + 1} of ${demoState.totalSteps}`}
              aria-current={index === demoState.stepIndex ? 'step' : undefined}
              onClick={() => demo.seek(index)}
            >
              {index + 1}
            </button>
          ))}
        </div>
      )}

      {/* Presentation settings, reachable without walking through the setup
          screen mid-demonstration. Everything here is borrowed: demo mode
          suspends storage writes and Reset demo puts it all back. */}
      <h3 className="democtl__label" id="democtl-language">Language</h3>
      <div className="democtl__row" role="group" aria-labelledby="democtl-language">
        {LANGUAGE_BUTTONS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className={`button ${value === profile.language ? '' : 'button--secondary'}`}
            aria-pressed={value === profile.language}
            onClick={() => update({ language: value })}
          >
            {label}
          </button>
        ))}
      </div>

      <h3 className="democtl__label" id="democtl-text">Text size</h3>
      <div className="democtl__row" role="group" aria-labelledby="democtl-text">
        {TEXT_SIZES.map((size) => (
          <button
            key={size}
            type="button"
            className={`button ${size === profile.textSize ? '' : 'button--secondary'}`}
            aria-pressed={size === profile.textSize}
            onClick={() => update({ textSize: size })}
          >
            {TEXT_SIZE_LABELS[size]}
          </button>
        ))}
      </div>

      <div className="democtl__row">
        <button
          type="button"
          className={`button ${profile.audio ? '' : 'button--secondary'}`}
          aria-pressed={profile.audio}
          onClick={toggleAudio}
        >
          {profile.audio ? 'Audio: on' : 'Audio: off'}
        </button>
      </div>

      {/* One tap back to a known state: default scenario, step 0, paused,
          and the presenter's real profile restored. */}
      <button type="button" className="button button--secondary" onClick={resetDemo}>
        Reset demo
      </button>
    </section>
  )
}
