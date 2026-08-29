import { describe, it, expect } from 'vitest'
import { buildCallScript } from './callScript'
import { DEFAULT_PROFILE, type UserProfile } from '@/lib/domain/profile'
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
      profile({ language: 'zh', mobility: 'wheelchair', transport: 'no-transport' }),
      warning,
      'evacuate',
    )
    expect(script.english.length).toBe(script.translated.length)
    expect(script.english.length).toBeGreaterThan(3)
  })

  it('states the need, the place, the mobility, and the transport situation', () => {
    const script = buildCallScript(
      profile({ mobility: 'wheelchair', transport: 'no-transport' }),
      warning,
      'evacuate',
    )
    const text = script.english.join(' ')
    expect(text).toContain('I need help to leave my home')
    expect(text).toContain('Katoomba')
    expect(text).toContain('I use a wheelchair')
    expect(text).toContain('I do not have any transport')
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
      profile({ language: 'vi', mobility: 'bedbound', transport: 'no-transport' }),
      warning,
      'check-on-me',
    )
    for (const line of script.translated) {
      expect(line.length).toBeGreaterThan(0)
    }
    expect(script.translated.join(' ')).toContain('Katoomba')
  })

  it('omits mobility and transport sentences when neither is a barrier', () => {
    const script = buildCallScript(
      profile({ mobility: 'none', transport: 'own-car' }),
      warning,
      'information',
    )
    const text = script.english.join(' ')
    expect(text).not.toContain('wheelchair')
    expect(text).not.toContain('do not have any transport')
  })
})
