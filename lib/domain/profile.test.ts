import { describe, it, expect } from 'vitest'
import { loadProfile, saveProfile, DEFAULT_PROFILE, PROFILE_STORAGE_KEY } from './profile'

function fakeStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial))
  return {
    get length() { return data.size },
    clear: () => data.clear(),
    getItem: (k: string) => data.get(k) ?? null,
    key: (i: number) => Array.from(data.keys())[i] ?? null,
    removeItem: (k: string) => { data.delete(k) },
    setItem: (k: string, v: string) => { data.set(k, v) },
  } as Storage
}

describe('loadProfile', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadProfile(fakeStorage())).toEqual(DEFAULT_PROFILE)
  })

  it('returns defaults when storage is unavailable', () => {
    expect(loadProfile(null)).toEqual(DEFAULT_PROFILE)
  })

  it('returns defaults rather than throwing on corrupt JSON', () => {
    const storage = fakeStorage({ [PROFILE_STORAGE_KEY]: 'not json {{{' })
    expect(loadProfile(storage)).toEqual(DEFAULT_PROFILE)
  })

  it('merges a partial stored profile over the defaults', () => {
    const storage = fakeStorage({
      [PROFILE_STORAGE_KEY]: JSON.stringify({ language: 'zh', largeText: true }),
    })
    const profile = loadProfile(storage)
    expect(profile.language).toBe('zh')
    expect(profile.largeText).toBe(true)
    expect(profile.transport).toBe(DEFAULT_PROFILE.transport)
  })

  it('rejects a stored language that is no longer supported', () => {
    const storage = fakeStorage({ [PROFILE_STORAGE_KEY]: JSON.stringify({ language: 'ar' }) })
    expect(loadProfile(storage).language).toBe('en')
  })

  it('round-trips a saved profile', () => {
    const storage = fakeStorage()
    const profile = {
      ...DEFAULT_PROFILE,
      language: 'vi' as const,
      mobility: 'wheelchair' as const,
      transport: 'no-transport' as const,
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
