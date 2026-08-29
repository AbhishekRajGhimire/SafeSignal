import { describe, it, expect } from 'vitest'
import {
  ACCESSIBILITY_NEEDS,
  DEFAULT_PROFILE,
  LANGUAGE_CODES,
  PACK_LANGUAGES,
  PROFILE_STORAGE_KEY,
  TEXT_SIZES,
  TRANSPORTS,
  directionOf,
  hasNeed,
  loadProfile,
  needsAssistedEvacuation,
  needsInterpreter,
  packLanguage,
  saveProfile,
  type UserProfile,
} from './profile'

function fakeStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed))
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  } as Storage
}

describe('loadProfile', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadProfile(fakeStorage())).toEqual(DEFAULT_PROFILE)
  })

  it('returns defaults rather than throwing on corrupt JSON', () => {
    const storage = fakeStorage({ [PROFILE_STORAGE_KEY]: 'not json {{{' })
    expect(loadProfile(storage)).toEqual(DEFAULT_PROFILE)
  })

  it('merges a partial stored profile over the defaults', () => {
    const storage = fakeStorage({
      [PROFILE_STORAGE_KEY]: JSON.stringify({ language: 'ne', textSize: 'x-large' }),
    })
    const profile = loadProfile(storage)
    expect(profile.language).toBe('ne')
    expect(profile.textSize).toBe('x-large')
    expect(profile.transport).toBe(DEFAULT_PROFILE.transport)
  })

  it('accepts every selectable language, including "other"', () => {
    for (const code of LANGUAGE_CODES) {
      const storage = fakeStorage({
        [PROFILE_STORAGE_KEY]: JSON.stringify({ language: code }),
      })
      expect(loadProfile(storage).language, code).toBe(code)
    }
  })

  it('rejects a language that is not offered', () => {
    const storage = fakeStorage({ [PROFILE_STORAGE_KEY]: JSON.stringify({ language: 'klingon' }) })
    expect(loadProfile(storage).language).toBe('en')
  })

  it('drops unknown needs and de-duplicates the rest', () => {
    const storage = fakeStorage({
      [PROFILE_STORAGE_KEY]: JSON.stringify({
        needs: ['mobility', 'mobility', 'teleportation', 'hearing'],
      }),
    })
    expect(loadProfile(storage).needs).toEqual(['mobility', 'hearing'])
  })

  it('treats a non-array needs value as no needs', () => {
    const storage = fakeStorage({
      [PROFILE_STORAGE_KEY]: JSON.stringify({ needs: 'mobility' }),
    })
    expect(loadProfile(storage).needs).toEqual([])
  })

  it('rejects a location with non-finite coordinates', () => {
    const storage = fakeStorage({
      [PROFILE_STORAGE_KEY]: JSON.stringify({ location: { lat: NaN, lon: 151, label: 'x' } }),
    })
    expect(loadProfile(storage).location).toBeNull()
  })

  it('round-trips a saved profile', () => {
    const storage = fakeStorage()
    const profile: UserProfile = {
      ...DEFAULT_PROFILE,
      language: 'ar',
      textSize: 'large',
      audio: true,
      needs: ['mobility', 'low-vision'],
      transport: 'accessible-transport',
      location: { lat: -33.7128, lon: 150.3119, label: 'Katoomba' },
      completedSetup: true,
    }
    saveProfile(profile, storage)
    expect(loadProfile(storage)).toEqual(profile)
  })

  it('does not throw when saving with storage unavailable', () => {
    expect(() => saveProfile(DEFAULT_PROFILE, null)).not.toThrow()
  })
})

describe('migration from the pre-2026-08-30 profile shape', () => {
  it('carries largeText across to the three-step text size', () => {
    const storage = fakeStorage({
      [PROFILE_STORAGE_KEY]: JSON.stringify({ largeText: true }),
    })
    expect(loadProfile(storage).textSize).toBe('large')
  })

  it('leaves text size at standard when largeText was false', () => {
    const storage = fakeStorage({ [PROFILE_STORAGE_KEY]: JSON.stringify({ largeText: false }) })
    expect(loadProfile(storage).textSize).toBe('standard')
  })

  it('maps a legacy mobility value onto the needs list', () => {
    for (const legacy of ['limited-walking', 'wheelchair', 'bedbound']) {
      const storage = fakeStorage({
        [PROFILE_STORAGE_KEY]: JSON.stringify({ mobility: legacy }),
      })
      expect(loadProfile(storage).needs, legacy).toEqual(['mobility'])
    }
  })

  it('maps legacy mobility "none" onto no needs', () => {
    const storage = fakeStorage({ [PROFILE_STORAGE_KEY]: JSON.stringify({ mobility: 'none' }) })
    expect(loadProfile(storage).needs).toEqual([])
  })

  it('maps legacy transport values onto the new set', () => {
    const cases: Record<string, string> = {
      'own-car': 'car',
      'can-get-lift': 'needs-assistance',
      'no-transport': 'needs-assistance',
    }
    for (const [legacy, expected] of Object.entries(cases)) {
      const storage = fakeStorage({
        [PROFILE_STORAGE_KEY]: JSON.stringify({ transport: legacy }),
      })
      expect(loadProfile(storage).transport, legacy).toBe(expected)
    }
  })

  it('prefers a new-shape value over the legacy one when both are present', () => {
    const storage = fakeStorage({
      [PROFILE_STORAGE_KEY]: JSON.stringify({
        largeText: true,
        textSize: 'x-large',
        mobility: 'wheelchair',
        needs: ['hearing'],
      }),
    })
    const profile = loadProfile(storage)
    expect(profile.textSize).toBe('x-large')
    expect(profile.needs).toEqual(['hearing'])
  })
})

describe('derived questions', () => {
  it('reports a need only when it was selected', () => {
    const profile: UserProfile = { ...DEFAULT_PROFILE, needs: ['hearing'] }
    expect(hasNeed(profile, 'hearing')).toBe(true)
    expect(hasNeed(profile, 'mobility')).toBe(false)
  })

  it('flags an interpreter for every language except English', () => {
    for (const code of LANGUAGE_CODES) {
      const profile: UserProfile = { ...DEFAULT_PROFILE, language: code }
      expect(needsInterpreter(profile), code).toBe(code !== 'en')
    }
  })

  it('flags assisted evacuation for the transport answers that imply it', () => {
    const assisted = ['accessible-transport', 'needs-assistance', 'unsure']
    for (const transport of TRANSPORTS) {
      const profile: UserProfile = { ...DEFAULT_PROFILE, transport }
      expect(needsAssistedEvacuation(profile), transport).toBe(assisted.includes(transport))
    }
  })

  it('flags assisted evacuation when mobility help is needed, whatever the transport', () => {
    const profile: UserProfile = { ...DEFAULT_PROFILE, transport: 'car', needs: ['mobility'] }
    expect(needsAssistedEvacuation(profile)).toBe(true)
  })

  it('does not flag assisted evacuation for a driver with no mobility need', () => {
    const profile: UserProfile = { ...DEFAULT_PROFILE, transport: 'car', needs: ['low-vision'] }
    expect(needsAssistedEvacuation(profile)).toBe(false)
  })
})

describe('option sets', () => {
  it('offers every pack language plus "other"', () => {
    expect(LANGUAGE_CODES).toEqual([...PACK_LANGUAGES, 'other'])
  })

  it('offers three text sizes and five needs', () => {
    expect(TEXT_SIZES).toHaveLength(3)
    expect(ACCESSIBILITY_NEEDS).toHaveLength(5)
    expect(TRANSPORTS).toHaveLength(6)
  })

  it('resolves a direction for every selectable language', () => {
    for (const code of LANGUAGE_CODES) {
      expect(['ltr', 'rtl']).toContain(directionOf(code))
    }
    expect(directionOf('other')).toBe(directionOf('en'))
    expect(packLanguage('other')).toBe('en')
  })
})
