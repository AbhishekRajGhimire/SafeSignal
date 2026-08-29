import { packLanguage, type LanguageCode, type PackLanguage } from '@/lib/domain/profile'
import type { PhrasePack } from './types'
import { en } from './phrases/en'
import { zh } from './phrases/zh'
import { ne } from './phrases/ne'
import { hi } from './phrases/hi'
import { ar } from './phrases/ar'
import { vi } from './phrases/vi'

export { UI_KEYS } from './types'
export type { PhrasePack, UIKey } from './types'

export const PACKS: Record<PackLanguage, PhrasePack> = { en, zh, ne, hi, ar, vi }

/** `other` has no pack of its own and reads in English. */
export function getPack(language: LanguageCode): PhrasePack {
  return PACKS[packLanguage(language)] ?? PACKS.en
}

/** BCP 47 tags handed to speechSynthesis and to the html lang attribute. */
export const SPEECH_LOCALE: Record<PackLanguage, string> = {
  en: 'en-AU',
  zh: 'zh-CN',
  ne: 'ne-NP',
  hi: 'hi-IN',
  ar: 'ar-SA',
  vi: 'vi-VN',
}

export function speechLocaleOf(language: LanguageCode): string {
  return SPEECH_LOCALE[packLanguage(language)]
}

/** Each language named in itself, so the picker is readable to its own speakers. */
export const LANGUAGE_NAMES: Record<PackLanguage, string> = {
  en: 'English',
  zh: '中文',
  ne: 'नेपाली',
  hi: 'हिन्दी',
  ar: 'العربية',
  vi: 'Tiếng Việt',
}

/** The English name, for anything an Australian operator will hear. */
export const LANGUAGE_IN_ENGLISH: Record<PackLanguage, string> = {
  en: 'English',
  zh: 'Mandarin',
  ne: 'Nepali',
  hi: 'Hindi',
  ar: 'Arabic',
  vi: 'Vietnamese',
}
