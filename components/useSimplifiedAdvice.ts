'use client'

import { useEffect, useState } from 'react'
import type { LanguageCode } from '@/lib/domain/profile'

/**
 * Returns null whenever the enrichment is unavailable, which every caller
 * must treat as normal rather than as an error.
 */
export function useSimplifiedAdvice(
  rawAdvice: string | null,
  language: LanguageCode,
): string | null {
  const [simplified, setSimplified] = useState<string | null>(null)

  useEffect(() => {
    setSimplified(null)
    if (!rawAdvice || language === 'en') return

    let active = true
    fetch('/api/simplify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: rawAdvice, language }),
    })
      .then((response) => response.json() as Promise<{ text: string | null }>)
      .then((data) => {
        if (active) setSimplified(data.text)
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [rawAdvice, language])

  return simplified
}
