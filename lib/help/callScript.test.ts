import { describe, it, expect } from 'vitest'
import { buildCallScript } from './callScript'
import {
  ACCESSIBILITY_NEEDS,
  DEFAULT_PROFILE,
  LANGUAGE_CODES,
  TRANSPORTS,
  type UserProfile,
} from '@/lib/domain/profile'
import type { Warning } from '@/lib/domain/warning'

const katoomba = { lat: -33.7128, lon: 150.3119, label: 'Katoomba' }

const profile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  ...DEFAULT_PROFILE,
  location: katoomba,
  ...overrides,
})

const warning: Warning = {
  id: 'demo',
  level: 'emergency-warning',
  title: 'GREEN GULLY TRAIL, KATOOMBA',
  location: 'Green Gully Trail, Katoomba',
  council: 'Blue Mountains',
  status: 'Out of control',
  type: 'Bush Fire',
  sizeHa: 840,
  agency: 'Rural Fire Service',
  updatedAt: null,
  publishedAt: null,
  point: { lat: -33.69, lon: 150.31 },
  polygons: [],
  officialUrl: 'https://example.invalid',
  rawAdvice: null,
}

describe('buildCallScript', () => {
  it('produces the same number of lines in both languages', () => {
    const script = buildCallScript(
      profile({ language: 'zh', needs: ['mobility'], transport: 'needs-assistance' }),
      warning,
      'evacuate',
    )
    expect(script.english.length).toBe(script.translated.length)
    expect(script.english.length).toBeGreaterThan(3)
  })

  it('states the need, the place, the accessibility need, and the transport situation', () => {
    const script = buildCallScript(
      profile({ needs: ['mobility'], transport: 'needs-assistance' }),
      warning,
      'evacuate',
    )
    const text = script.english.join(' ')
    expect(text).toContain('I need help to leave my home')
    expect(text).toContain('Katoomba')
    expect(text).toContain('I need help to move around')
    expect(text).toContain('I need someone to help me leave')
  })

  it('asks for an interpreter only when the user does not speak English', () => {
    const zh = buildCallScript(profile({ language: 'zh' }), warning, 'evacuate')
    expect(zh.english.join(' ')).toContain('I speak Mandarin')

    const en = buildCallScript(profile({ language: 'en' }), warning, 'evacuate')
    expect(en.english.join(' ')).not.toContain('interpreter')
  })

  it('names the official alert level so the operator knows the context', () => {
    const script = buildCallScript(profile(), warning, 'evacuate')
    expect(script.english.join(' ')).toContain('Emergency Warning')
  })

  it('omits the fire sentence when there is no warning', () => {
    const script = buildCallScript(profile(), null, 'information')
    expect(script.english.join(' ')).not.toContain('Emergency Warning')
    expect(script.english.length).toBeGreaterThan(1)
  })

  it('says the place is unknown rather than printing an empty gap', () => {
    const script = buildCallScript(profile({ location: null }), warning, 'evacuate')
    expect(script.english.join(' ')).not.toContain('I am at .')
  })

  it('translates every line for a Vietnamese speaker', () => {
    const script = buildCallScript(
      profile({ language: 'vi', needs: ['mobility'], transport: 'needs-assistance' }),
      warning,
      'check-on-me',
    )
    for (const line of script.translated) {
      expect(line.length).toBeGreaterThan(0)
    }
    expect(script.translated.join(' ')).toContain('Katoomba')
  })

  it('translates the language name and alert level inside the translated column', () => {
    // The translated column exists so the caller understands what they are
    // saying. Leaving "Mandarin" and "Emergency Warning" in English there
    // defeats the point of showing it at all.
    const script = buildCallScript(profile({ language: 'zh' }), warning, 'evacuate')
    const translated = script.translated.join(' ')
    expect(translated).not.toContain('Mandarin')
    expect(translated).not.toContain('Emergency Warning')
    expect(translated).toContain('中文')
    expect(translated).toContain('紧急警报')
  })

  it('keeps the English column in English so the operator understands it', () => {
    const script = buildCallScript(profile({ language: 'vi' }), warning, 'evacuate')
    const english = script.english.join(' ')
    expect(english).toContain('Vietnamese')
    expect(english).toContain('Emergency Warning')
  })

  it('omits mobility and transport sentences when neither is a barrier', () => {
    const script = buildCallScript(
      profile({ needs: [], transport: 'car' }),
      warning,
      'information',
    )
    const text = script.english.join(' ')
    expect(text).not.toContain('wheelchair')
    expect(text).not.toContain('do not have any transport')
  })
})

describe('coverage of the new profile options', () => {
  it('produces a line for every accessibility need, in every language', () => {
    const expected: Record<string, string> = {
      mobility: 'I need help to move around',
      'low-vision': 'I have low vision',
      hearing: 'I have difficulty hearing',
      cognitive: 'speak slowly',
      simpler: 'simple words',
    }
    for (const need of ACCESSIBILITY_NEEDS) {
      for (const language of LANGUAGE_CODES) {
        const script = buildCallScript(
          profile({ needs: [need], language }),
          warning,
          'evacuate',
        )
        expect(script.english.join(' '), `${need}/${language}`).toContain(expected[need])
        // Both columns always have the same number of sentences, so the
        // caller can follow along line by line.
        expect(script.translated.length, `${need}/${language}`).toBe(script.english.length)
        for (const line of script.translated) {
          expect(line.length, `${need}/${language}`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('states the transport situation for every answer except having a car', () => {
    for (const transport of TRANSPORTS) {
      const script = buildCallScript(profile({ transport }), warning, 'evacuate')
      const text = script.english.join(' ')
      if (transport === 'car') {
        expect(text, transport).not.toContain('I do not have a car')
        expect(text, transport).not.toContain('help me leave')
      } else {
        expect(script.english.length, transport).toBeGreaterThan(3)
      }
    }
  })

  it('leaves no placeholder unfilled in any language', () => {
    for (const language of LANGUAGE_CODES) {
      const script = buildCallScript(
        profile({ language, needs: [...ACCESSIBILITY_NEEDS], transport: 'unsure' }),
        warning,
        'evacuate',
      )
      for (const line of [...script.english, ...script.translated]) {
        expect(line, `${language}: ${line}`).not.toMatch(/\{\w+\}/)
      }
    }
  })

  it('asks for an interpreter when the language is not listed, without naming it', () => {
    const script = buildCallScript(profile({ language: 'other' }), warning, 'evacuate')
    const text = script.english.join(' ')
    expect(text).toContain('Please connect me to an interpreter')
    expect(text).toContain('a language not listed here')
  })
})
