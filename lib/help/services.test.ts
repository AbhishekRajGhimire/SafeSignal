import { describe, it, expect } from 'vitest'
import { SERVICES, rankServices } from './services'
import { LANGUAGE_CODES, DEFAULT_PROFILE, type UserProfile } from '@/lib/domain/profile'

const profile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  ...DEFAULT_PROFILE,
  ...overrides,
})

describe('SERVICES', () => {
  it('describes every service in every supported language', () => {
    for (const service of SERVICES) {
      for (const code of LANGUAGE_CODES) {
        expect(service.descriptions[code], `${service.id}.${code}`).toBeTruthy()
      }
    }
  })

  it('has a dialable phone number for every service', () => {
    for (const service of SERVICES) {
      expect(service.phone, service.id).toMatch(/^[0-9]+$/)
    }
  })

  it('has unique ids', () => {
    const ids = SERVICES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('rankServices', () => {
  it('puts Triple Zero first during an emergency warning', () => {
    const ranked = rankServices({
      level: 'emergency-warning',
      inside: false,
      profile: profile(),
    })
    expect(ranked[0].id).toBe('triple-zero')
  })

  it('puts Triple Zero first when the user is inside the fire area', () => {
    const ranked = rankServices({ level: 'advice', inside: true, profile: profile() })
    expect(ranked[0].id).toBe('triple-zero')
  })

  it('hides the interpreter line for an English speaker', () => {
    const ranked = rankServices({ level: 'advice', inside: false, profile: profile({ language: 'en' }) })
    expect(ranked.map((s) => s.id)).not.toContain('tis-national')
  })

  it('shows the interpreter line high up for a Mandarin speaker', () => {
    const ranked = rankServices({
      level: 'emergency-warning',
      inside: false,
      profile: profile({ language: 'zh' }),
    })
    expect(ranked.slice(0, 2).map((s) => s.id)).toContain('tis-national')
  })

  it('lifts evacuation and transport help for a wheelchair user with no car', () => {
    const ranked = rankServices({
      level: 'watch-and-act',
      inside: false,
      profile: profile({ mobility: 'wheelchair', transport: 'no-transport' }),
    })
    const withCar = rankServices({
      level: 'watch-and-act',
      inside: false,
      profile: profile({ mobility: 'none', transport: 'own-car' }),
    })
    expect(ranked.findIndex((s) => s.id === 'service-nsw'))
      .toBeLessThan(withCar.findIndex((s) => s.id === 'service-nsw'))
  })

  it('produces the full ordering for the scenario in the problem statement', () => {
    // Older Mandarin-speaking wheelchair user with no car, during an emergency warning.
    const ranked = rankServices({
      level: 'emergency-warning',
      inside: false,
      profile: profile({ language: 'zh', mobility: 'wheelchair', transport: 'no-transport' }),
    })
    expect(ranked.map((s) => s.id)).toEqual([
      'triple-zero',
      'tis-national',
      'service-nsw',
      'rfs-info',
      'relay-service',
      'ses',
    ])
  })

  it('leads with the information line, not Triple Zero, when nothing is urgent', () => {
    const ranked = rankServices({ level: 'advice', inside: false, profile: profile() })
    expect(ranked[0].id).toBe('rfs-info')
  })

  it('is stable when there is no warning at all', () => {
    const ranked = rankServices({ level: null, inside: false, profile: profile() })
    expect(ranked.length).toBeGreaterThan(0)
    expect(ranked[0].id).toBe('rfs-info')
  })
})
