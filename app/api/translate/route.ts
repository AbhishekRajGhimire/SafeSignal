import { NextResponse } from 'next/server'
import {
  LANGUAGE_NAME_FOR_MODEL,
  MAX_SOURCE_CHARS,
  SYSTEM_PROMPT,
  acceptTranslation,
  isTranslatable,
  type TranslationFailure,
} from '@/lib/i18n/translation'

export const dynamic = 'force-dynamic'

/**
 * Measured, not guessed: 676 source characters took 6.2s and 900 took 7.7s,
 * so the previous 10s ceiling was already marginal and anything longer timed
 * out entirely. A translation that arrives late costs nothing, because the
 * official English is on screen the whole time; one that never arrives costs
 * the reader their comprehension.
 */
const TIMEOUT_MS = 25_000
const MODEL = 'claude-sonnet-5'

/**
 * Rate limiting, per instance, in memory, never persisted.
 *
 * The previous route was an unauthenticated proxy to the Anthropic API with
 * no length cap: anyone who found the URL could spend the key. IP addresses
 * are counted here and never written anywhere, which is the least
 * identifying thing that still works.
 */
const WINDOW_MS = 5 * 60_000
const MAX_PER_WINDOW = 20
const hits = new Map<string, { count: number; resetAt: number }>()

function overLimit(key: string, now: number): boolean {
  const entry = hits.get(key)
  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }
  entry.count += 1
  return entry.count > MAX_PER_WINDOW
}

function unavailable(reason: TranslationFailure) {
  // Always 200. The caller must treat an absent translation as normal, and an
  // error status would invite retry storms during an emergency.
  return NextResponse.json({ status: 'unavailable', reason }, {
    headers: { 'cache-control': 'no-store' },
  })
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  // No key is a supported configuration, not an error.
  if (!apiKey) return unavailable('no-key')

  // Same-origin only. This route exists for this application.
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  if (origin && host && !origin.endsWith(host)) return unavailable('network')

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (overLimit(ip, Date.now())) return unavailable('network')

  let body: { text?: unknown; language?: unknown }
  try {
    body = await request.json()
  } catch {
    return unavailable('malformed-response')
  }

  const source = typeof body.text === 'string' ? body.text.trim() : ''
  const language = typeof body.language === 'string' ? body.language : ''

  if (!source) return unavailable('nothing-to-translate')
  if (source.length > MAX_SOURCE_CHARS) return unavailable('nothing-to-translate')
  if (!isTranslatable(language)) return unavailable('unsupported-language')

  let response: Response
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        // Sized against MAX_SOURCE_CHARS, not against a typical warning.
        // At 600 this truncated long advice mid-word, because adaptive
        // thinking draws from the same budget and Devanagari and Arabic
        // script cost far more tokens per character than Latin. Unused
        // budget is not billed, so the ceiling is close to free.
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Translate into ${LANGUAGE_NAME_FOR_MODEL[language]}:\n\n${source}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    return unavailable(timedOut ? 'timeout' : 'network')
  }

  if (!response.ok) return unavailable('http-error')

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return unavailable('malformed-response')
  }

  // Verified against the source before it is allowed anywhere near a screen.
  const outcome = acceptTranslation(source, payload)

  return NextResponse.json(outcome, { headers: { 'cache-control': 'no-store' } })
}
