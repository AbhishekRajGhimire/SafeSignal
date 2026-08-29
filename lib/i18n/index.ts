import type { LanguageCode } from '@/lib/domain/profile'
import type { PhrasePack } from './types'
import { en } from './phrases/en'
import { zh } from './phrases/zh'
import { hi } from './phrases/hi'
import { vi } from './phrases/vi'

export { UI_KEYS } from './types'
export type { PhrasePack, UIKey } from './types'

export const PACKS: Record<LanguageCode, PhrasePack> = { en, zh, hi, vi }

export function getPack(language: LanguageCode): PhrasePack {
  return PACKS[language] ?? PACKS.en
}

/** BCP 47 tags handed to speechSynthesis and to the html lang attribute. */
export const SPEECH_LOCALE: Record<LanguageCode, string> = {
  en: 'en-AU',
  zh: 'zh-CN',
  hi: 'hi-IN',
  vi: 'vi-VN',
}

/** Each language named in itself, so the picker is readable to its own speakers. */
export const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  en: 'English',
  zh: '中文',
  hi: 'हिन्दी',
  vi: 'Tiếng Việt',
}
