import { describe, it, expect } from 'vitest'
import { SERVICES, rankServices } from './services'
import {
  LANGUAGE_CODES,
  PACK_LANGUAGES,
  DEFAULT_PROFILE,
  type UserProfile,
} from '@/lib/domain/profile'

const profile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  ...DEFAULT_PROFILE,
  ...overrides,
})

describe('SERVICES', () => {
  it('describes every service in every language that has a pack', () => {
    for (const service of SERVICES) {
      for (const code of PACK_LANGUAGES) {
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
      profile: profile({ needs: ['mobility'], transport: 'needs-assistance' }),
    })
    const withCar = rankServices({
      level: 'watch-and-act',
      inside: false,
      profile: profile({ needs: [], transport: 'car' }),
    })
    expect(ranked.findIndex((s) => s.id === 'service-nsw'))
      .toBeLessThan(withCar.findIndex((s) => s.id === 'service-nsw'))
  })

  it('produces the full ordering for the scenario in the problem statement', () => {
    // Older Mandarin-speaking wheelchair user with no car, during an emergency warning.
    const ranked = rankServices({
      level: 'emergency-warning',
      inside: false,
      profile: profile({ language: 'zh', needs: ['mobility'], transport: 'needs-assistance' }),
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

describe('the profile changes which help comes first, never the warning', () => {
  it('promotes the relay service when the user told us they cannot hear well', () => {
    const withHearing = rankServices({ level: 'advice', inside: false, profile: profile({ needs: ['hearing'] }) })
    const without = rankServices({ level: 'advice', inside: false, profile: profile({ needs: [] }) })
    expect(withHearing.findIndex((s) => s.id === 'relay-service'))
      .toBeLessThan(without.findIndex((s) => s.id === 'relay-service'))
  })

  it('promotes Service NSW for every transport answer that implies needing help', () => {
    for (const transport of ['accessible-transport', 'needs-assistance', 'unsure'] as const) {
      const ranked = rankServices({ level: 'advice', inside: false, profile: profile({ transport }) })
      const nsw = ranked.findIndex((s) => s.id === 'service-nsw')
      const rfs = ranked.findIndex((s) => s.id === 'rfs-info')
      expect(nsw, transport).toBeLessThan(rfs)
    }
  })

  it('offers the interpreter line for every language except English', () => {
    for (const language of LANGUAGE_CODES) {
      const ranked = rankServices({ level: 'advice', inside: false, profile: profile({ language }) })
      const hasTis = ranked.some((s) => s.id === 'tis-national')
      expect(hasTis, language).toBe(language !== 'en')
    }
  })

  it('always offers Triple Zero, whatever the profile', () => {
    for (const language of LANGUAGE_CODES) {
      const ranked = rankServices({ level: 'advice', inside: false, profile: profile({ language }) })
      expect(ranked.some((s) => s.id === 'triple-zero'), language).toBe(true)
    }
  })
})
