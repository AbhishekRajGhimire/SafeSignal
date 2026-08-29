/**
 * The accessibility and communication profile.
 *
 * INVARIANT: this profile may influence HOW information is presented and
 * WHICH assistance is offered. It must never alter the meaning, the severity,
 * or the official advice of a warning.
 */

/** Languages with a full human-written phrase pack. */
export type PackLanguage = 'en' | 'zh' | 'ne' | 'hi' | 'ar' | 'vi'

/**
 * `other` means "my language is not listed". The interface renders in English
 * and the free interpreter service is promoted, which is the honest response
 * to a language we cannot render.
 */
export type LanguageCode = PackLanguage | 'other'

export type TextSize = 'standard' | 'large' | 'x-large'

/** Multi-select. An empty list means "none of these". */
export type AccessibilityNeed =
  | 'mobility'
  | 'low-vision'
  | 'hearing'
  | 'cognitive'
  | 'simpler'

export type Transport =
  | 'car'
  | 'public-transport'
  | 'taxi-rideshare'
  | 'accessible-transport'
  | 'needs-assistance'
  | 'unsure'

export const PACK_LANGUAGES: readonly PackLanguage[] = ['en', 'zh', 'ne', 'hi', 'ar', 'vi'] as const
export const LANGUAGE_CODES: readonly LanguageCode[] = [...PACK_LANGUAGES, 'other'] as const
export const TEXT_SIZES: readonly TextSize[] = ['standard', 'large', 'x-large'] as const
export const ACCESSIBILITY_NEEDS: readonly AccessibilityNeed[] = [
  'mobility',
  'low-vision',
  'hearing',
  'cognitive',
  'simpler',
] as const
export const TRANSPORTS: readonly Transport[] = [
  'car',
  'public-transport',
  'taxi-rideshare',
  'accessible-transport',
  'needs-assistance',
  'unsure',
] as const

/** Arabic is the only right-to-left language in the set. */
export const TEXT_DIRECTION: Record<PackLanguage, 'ltr' | 'rtl'> = {
  en: 'ltr',
  zh: 'ltr',
  ne: 'ltr',
  hi: 'ltr',
  ar: 'rtl',
  vi: 'ltr',
}

/** `other` has no pack of its own and reads in English. */
export function packLanguage(language: LanguageCode): PackLanguage {
  return language === 'other' ? 'en' : language
}

export function directionOf(language: LanguageCode): 'ltr' | 'rtl' {
  return TEXT_DIRECTION[packLanguage(language)]
}

export interface UserProfile {
  location: { lat: number; lon: number; label: string } | null
  language: LanguageCode
  textSize: TextSize
  audio: boolean
  needs: AccessibilityNeed[]
  transport: Transport
  completedSetup: boolean
}

export const PROFILE_STORAGE_KEY = 'safesignal.profile.v1'

export const DEFAULT_PROFILE: UserProfile = {
  location: null,
  language: 'en',
  textSize: 'standard',
  audio: false,
  needs: [],
  transport: 'car',
  completedSetup: false,
}

export function hasNeed(profile: UserProfile, need: AccessibilityNeed): boolean {
  return profile.needs.includes(need)
}

/** True when the person told us their language is not one we render. */
export function needsInterpreter(profile: UserProfile): boolean {
  return profile.language !== 'en'
}

/**
 * True when leaving is unlikely to be possible unaided. Drives which official
 * assistance pathway is offered first. It never changes the warning itself.
 */
export function needsAssistedEvacuation(profile: UserProfile): boolean {
  return (
    profile.transport === 'accessible-transport' ||
    profile.transport === 'needs-assistance' ||
    profile.transport === 'unsure' ||
    hasNeed(profile, 'mobility')
  )
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback
}

function readNeeds(value: unknown): AccessibilityNeed[] {
  if (!Array.isArray(value)) return []
  const allowed = ACCESSIBILITY_NEEDS as readonly string[]
  const seen = new Set<AccessibilityNeed>()
  for (const item of value) {
    if (typeof item === 'string' && allowed.includes(item)) seen.add(item as AccessibilityNeed)
  }
  return [...seen]
}

function readLocation(value: unknown): UserProfile['location'] {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (typeof v.lat !== 'number' || typeof v.lon !== 'number') return null
  if (!Number.isFinite(v.lat) || !Number.isFinite(v.lon)) return null
  return { lat: v.lat, lon: v.lon, label: typeof v.label === 'string' ? v.label : '' }
}

/** Older builds stored `largeText: boolean`. Carry those users across. */
function readTextSize(v: Record<string, unknown>): TextSize {
  if (typeof v.textSize === 'string') {
    return oneOf(v.textSize, TEXT_SIZES, DEFAULT_PROFILE.textSize)
  }
  if (v.largeText === true) return 'large'
  return DEFAULT_PROFILE.textSize
}

/** Older builds stored a single `mobility` value. Map it onto the need list. */
function readMigratedNeeds(v: Record<string, unknown>): AccessibilityNeed[] {
  if (Array.isArray(v.needs)) return readNeeds(v.needs)
  const legacy = v.mobility
  if (legacy === 'limited-walking' || legacy === 'wheelchair' || legacy === 'bedbound') {
    return ['mobility']
  }
  return []
}

const LEGACY_TRANSPORT: Record<string, Transport> = {
  'own-car': 'car',
  'can-get-lift': 'needs-assistance',
  'no-transport': 'needs-assistance',
}

function readTransport(v: Record<string, unknown>): Transport {
  if (typeof v.transport === 'string' && LEGACY_TRANSPORT[v.transport]) {
    return LEGACY_TRANSPORT[v.transport]
  }
  return oneOf(v.transport, TRANSPORTS, DEFAULT_PROFILE.transport)
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
  if (!storage) return { ...DEFAULT_PROFILE, needs: [] }

  let raw: unknown
  try {
    const stored = storage.getItem(PROFILE_STORAGE_KEY)
    if (!stored) return { ...DEFAULT_PROFILE, needs: [] }
    raw = JSON.parse(stored)
  } catch {
    return { ...DEFAULT_PROFILE, needs: [] }
  }

  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PROFILE, needs: [] }
  const v = raw as Record<string, unknown>

  return {
    location: readLocation(v.location),
    language: oneOf(v.language, LANGUAGE_CODES, DEFAULT_PROFILE.language),
    textSize: readTextSize(v),
    audio: typeof v.audio === 'boolean' ? v.audio : DEFAULT_PROFILE.audio,
    needs: readMigratedNeeds(v),
    transport: readTransport(v),
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
