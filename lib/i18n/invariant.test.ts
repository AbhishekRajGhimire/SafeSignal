import { describe, it, expect } from 'vitest'
import { renderWarning } from './render'
import { getPack } from './index'
import {
  ACCESSIBILITY_NEEDS,
  LANGUAGE_CODES,
  TEXT_SIZES,
  TRANSPORTS,
  DEFAULT_PROFILE,
  type UserProfile,
} from '@/lib/domain/profile'
import { ALERT_LEVELS, type AlertLevel, type Warning } from '@/lib/domain/warning'
import type { RelevantWarning } from '@/lib/domain/match'
import { makeWarning } from '@/lib/testing/fixtures'

/**
 * THE INVARIANT
 *
 * The profile may change HOW a warning is presented. It must never change the
 * meaning, the severity, or the official advice.
 *
 * `renderWarning` takes a language and nothing else from the profile, so needs,
 * transport, text size and audio are structurally unable to reach it. These
 * tests assert that the boundary holds in behaviour as well as in signature.
 */

function warningAt(level: AlertLevel): Warning {
  return {
    id: 'invariant-fixture',
    level,
    title: 'GREEN GULLY TRAIL, KATOOMBA',
    location: 'Green Gully Trail, Katoomba',
    council: 'Blue Mountains',
    status: 'Out of control',
    type: 'Bush Fire',
    sizeHa: 180,
    agency: 'Rural Fire Service',
    updatedAt: new Date('2026-08-30T04:00:00.000Z'),
    publishedAt: new Date('2026-08-30T03:00:00.000Z'),
    point: { lat: -33.72, lon: 150.31 },
    polygons: [],
    officialUrl: 'https://www.rfs.nsw.gov.au/fire-information/fires-near-me',
    rawAdvice: 'You are in danger and need to act immediately to survive.',
    fields: {},
    raw: { properties: {}, geometry: null },
    provenance: makeWarning().provenance,
  }
}

const relevantAt = (level: AlertLevel): RelevantWarning => ({
  warning: warningAt(level),
  distanceKm: 2.1,
  inside: false,
  band: 'very-close',
  verdict: 'not-currently-affected' as const,
  reason: 'outside-polygon' as const,
  rejectedRings: 0,
})

/** Every profile a person can actually produce through the setup flow. */
function everyProfile(): UserProfile[] {
  const out: UserProfile[] = []
  const needSets: UserProfile['needs'][] = [
    [],
    ...ACCESSIBILITY_NEEDS.map((n) => [n]),
    [...ACCESSIBILITY_NEEDS],
  ]
  for (const language of LANGUAGE_CODES) {
    for (const textSize of TEXT_SIZES) {
      for (const transport of TRANSPORTS) {
        for (const needs of needSets) {
          for (const audio of [true, false]) {
            out.push({ ...DEFAULT_PROFILE, language, textSize, transport, needs, audio })
          }
        }
      }
    }
  }
  return out
}

const PROFILES = everyProfile()

describe('the profile never alters meaning, severity, or official advice', () => {
  it('covers a realistic spread of profiles', () => {
    // 7 languages x 3 text sizes x 6 transports x 7 need sets x 2 audio
    expect(PROFILES.length).toBe(7 * 3 * 6 * 7 * 2)
  })

  it('never changes the alert level, for any profile or level', () => {
    for (const level of ALERT_LEVELS) {
      const relevant = relevantAt(level)
      for (const profile of PROFILES) {
        const rendered = renderWarning(relevant, profile.language)
        expect(rendered.levelName, `${level} / ${profile.language}`).toBe(
          getPack(profile.language).levelName[level],
        )
      }
    }
  })

  it('produces byte-identical official wording for every profile', () => {
    for (const level of ALERT_LEVELS) {
      const relevant = relevantAt(level)
      const baseline = renderWarning(relevant, 'en').officialText
      for (const profile of PROFILES) {
        expect(renderWarning(relevant, profile.language).officialText, profile.language).toBe(
          baseline,
        )
      }
    }
  })

  it('keeps the official English advice verbatim inside the official block', () => {
    const relevant = relevantAt('emergency-warning')
    for (const profile of PROFILES) {
      const rendered = renderWarning(relevant, profile.language)
      expect(rendered.officialText).toContain(relevant.warning.rawAdvice!)
    }
  })

  it('never changes the official link', () => {
    const relevant = relevantAt('watch-and-act')
    for (const profile of PROFILES) {
      expect(renderWarning(relevant, profile.language).officialUrl).toBe(
        relevant.warning.officialUrl,
      )
    }
  })

  it('does change the plain-language tier, which is the point', () => {
    const relevant = relevantAt('emergency-warning')
    const english = renderWarning(relevant, 'en').levelMeaning
    const arabic = renderWarning(relevant, 'ar').levelMeaning
    expect(arabic).not.toBe(english)
  })

  it('renders "other" identically to English', () => {
    const relevant = relevantAt('emergency-warning')
    const other = renderWarning(relevant, 'other')
    const english = renderWarning(relevant, 'en')
    expect(other.levelMeaning).toBe(english.levelMeaning)
    expect(other.speechLocale).toBe(english.speechLocale)
  })
})
