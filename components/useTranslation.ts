'use client'

import { useEffect, useState } from 'react'
import { isTranslatable, type TranslationOutcome } from '@/lib/i18n/translation'
import type { LanguageCode } from '@/lib/domain/profile'

/**
 * Requests an accessible translation of official free text.
 *
 * Returns an outcome rather than a string, because the interface must be able
 * to say why a translation is absent. An absent translation is normal, never
 * an error, and the official message is always on screen regardless.
 */
export function useTranslation(
  source: string | null,
  language: LanguageCode,
): TranslationOutcome | null {
  const [outcome, setOutcome] = useState<TranslationOutcome | null>(null)

  useEffect(() => {
    setOutcome(null)
    if (!source) return
    // English readers already have the official message in English. There is
    // nothing for this layer to add, and asking a model would only introduce
    // a chance of drift.
    if (!isTranslatable(language)) return

    let active = true
    const controller = new AbortController()

    fetch('/api/translate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: source, language }),
      signal: controller.signal,
    })
      .then((response) => response.json() as Promise<TranslationOutcome>)
      .then((result) => {
        if (active) setOutcome(result)
      })
      .catch(() => {
        if (active) setOutcome({ status: 'unavailable', reason: 'network' })
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [source, language])

  return outcome
}
