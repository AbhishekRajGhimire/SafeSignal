export type LanguageCode = 'en' | 'zh' | 'hi' | 'vi'
export type Mobility = 'none' | 'limited-walking' | 'wheelchair' | 'bedbound'
export type Transport = 'own-car' | 'can-get-lift' | 'no-transport'

export const LANGUAGE_CODES: readonly LanguageCode[] = ['en', 'zh', 'hi', 'vi'] as const
const MOBILITIES: readonly Mobility[] = ['none', 'limited-walking', 'wheelchair', 'bedbound'] as const
const TRANSPORTS: readonly Transport[] = ['own-car', 'can-get-lift', 'no-transport'] as const

export interface UserProfile {
  location: { lat: number; lon: number; label: string } | null
  language: LanguageCode
  mobility: Mobility
  transport: Transport
  largeText: boolean
  audio: boolean
  completedSetup: boolean
}

export const PROFILE_STORAGE_KEY = 'safesignal.profile.v1'

export const DEFAULT_PROFILE: UserProfile = {
  location: null,
  language: 'en',
  mobility: 'none',
  transport: 'own-car',
  largeText: false,
  audio: false,
  completedSetup: false,
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback
}

function readLocation(value: unknown): UserProfile['location'] {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (typeof v.lat !== 'number' || typeof v.lon !== 'number') return null
  return { lat: v.lat, lon: v.lon, label: typeof v.label === 'string' ? v.label : '' }
}

function defaultStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/**
 * Merges over defaults rather than trusting the stored shape. A profile
 * written by an older build must never be able to crash the app.
 */
export function loadProfile(storage: Storage | null = defaultStorage()): UserProfile {
  if (!storage) return { ...DEFAULT_PROFILE }

  let raw: unknown
  try {
    const stored = storage.getItem(PROFILE_STORAGE_KEY)
    if (!stored) return { ...DEFAULT_PROFILE }
    raw = JSON.parse(stored)
  } catch {
    return { ...DEFAULT_PROFILE }
  }

  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PROFILE }
  const v = raw as Record<string, unknown>

  return {
    location: readLocation(v.location),
    language: oneOf(v.language, LANGUAGE_CODES, DEFAULT_PROFILE.language),
    mobility: oneOf(v.mobility, MOBILITIES, DEFAULT_PROFILE.mobility),
    transport: oneOf(v.transport, TRANSPORTS, DEFAULT_PROFILE.transport),
    largeText: typeof v.largeText === 'boolean' ? v.largeText : DEFAULT_PROFILE.largeText,
    audio: typeof v.audio === 'boolean' ? v.audio : DEFAULT_PROFILE.audio,
    completedSetup: typeof v.completedSetup === 'boolean' ? v.completedSetup : false,
  }
}

export function saveProfile(
  profile: UserProfile,
  storage: Storage | null = defaultStorage(),
): void {
  if (!storage) return
  try {
    storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile))
  } catch {
    // Private browsing and full quotas both throw. Losing preferences is
    // survivable; crashing during a bushfire is not.
  }
}
