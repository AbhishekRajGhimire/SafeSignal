import type { Warning } from '@/lib/domain/warning'
import type { LanguageCode } from '@/lib/domain/profile'
import { getPack } from '@/lib/i18n'

export interface ChecklistItem {
  text: string
  /** Where the sentence came from. Rendered on screen, never hidden. */
  source: 'nsw-rfs' | 'safesignal'
}

/**
 * Official sentences are kept verbatim and in English. Translating free-text
 * emergency advice by machine is exactly the kind of invention this app
 * refuses to do; the Claude layer handles that path when it is available.
 */
function officialSentences(rawAdvice: string): string[] {
  return rawAdvice
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
}

export function buildChecklist(
  warning: Warning | null,
  language: LanguageCode,
): ChecklistItem[] {
  if (!warning) return []

  const pack = getPack(language)
  const items: ChecklistItem[] = [
    { text: pack.levelAction[warning.level], source: 'safesignal' },
  ]

  if (warning.rawAdvice) {
    for (const sentence of officialSentences(warning.rawAdvice)) {
      items.push({ text: sentence, source: 'nsw-rfs' })
    }
  }

  return items
}
