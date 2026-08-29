/**
 * The language accessibility layer.
 *
 * SafeSignal may translate and simplify official wording. It must never
 * author emergency advice, and it must never change what the official
 * message says: not the severity, not the instructions, not the places, not
 * the evacuation requirements, not the phone numbers, not the meaning of
 * official terminology.
 *
 * Two things enforce that here.
 *
 * The scope is narrow: only free text the RFS itself wrote is ever sent for
 * translation. Alert levels, level meanings, level actions and status
 * vocabulary all come from human-written phrase packs and never touch a
 * model.
 *
 * And the output is checked before it is shown. A translation that
 * introduces a number the source did not contain is rejected, because that
 * is what a changed distance, a changed fire size, or an invented phone
 * number looks like. When a translation is rejected the original official
 * message is shown alone. It is never patched, never partially used, and
 * never replaced by something SafeSignal wrote.
 */

export type TranslationFailure =
  | 'no-key'
  | 'unsupported-language'
  | 'nothing-to-translate'
  | 'empty-response'
  | 'malformed-response'
  | 'timeout'
  | 'network'
  | 'http-error'
  | 'rejected-unsafe'
  | 'truncated'

export type TranslationOutcome =
  | { status: 'translated'; text: string }
  | { status: 'unavailable'; reason: TranslationFailure }

/** Languages the layer will translate into. `other` reads in English. */
export const TRANSLATABLE = ['zh', 'ne', 'hi', 'ar', 'vi'] as const
export type TranslatableLanguage = (typeof TRANSLATABLE)[number]

export const LANGUAGE_NAME_FOR_MODEL: Record<TranslatableLanguage, string> = {
  zh: 'Simplified Chinese',
  ne: 'Nepali',
  hi: 'Hindi',
  ar: 'Arabic',
  vi: 'Vietnamese',
}

export function isTranslatable(language: string): language is TranslatableLanguage {
  return (TRANSLATABLE as readonly string[]).includes(language)
}

/** Longest source text accepted, in characters. */
export const MAX_SOURCE_CHARS = 2_000

/* ------------------------------------------------------------------ *
 * Output verification
 * ------------------------------------------------------------------ */

/** Arabic-Indic and Devanagari digits, so a translated numeral still compares. */
const DIGIT_MAP: Record<string, string> = {}
for (let i = 0; i < 10; i += 1) {
  DIGIT_MAP[String.fromCharCode(0x0660 + i)] = String(i) // Arabic-Indic
  DIGIT_MAP[String.fromCharCode(0x06f0 + i)] = String(i) // Extended Arabic-Indic
  DIGIT_MAP[String.fromCharCode(0x0966 + i)] = String(i) // Devanagari
}

export function normaliseDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹०-९]/g, (d) => DIGIT_MAP[d] ?? d)
}

/**
 * Every run of digits, with separators stripped, so `1,234` and `1234` and
 * `131 450` compare as the publisher wrote them rather than as formatted.
 */
export function numericTokens(text: string): string[] {
  const normalised = normaliseDigits(text)
  const runs = normalised.match(/\d[\d\s,.]*/g) ?? []
  return runs
    .map((run) => run.replace(/[\s,.]/g, ''))
    .filter((run) => run.length > 0)
}

export interface Rejection {
  reason: 'empty' | 'invented-number' | 'implausible-length' | 'unchanged'
  detail?: string
}

/** Generous bounds: Chinese is far shorter than English, Hindi far longer. */
const MIN_RATIO = 0.2
const MAX_RATIO = 6

/**
 * Decides whether a candidate translation may be shown beside the original.
 *
 * This is deliberately conservative. Falling back to the official English
 * costs a user some comprehension; showing an invented number costs them
 * the wrong address, the wrong phone number, or the wrong fire size.
 */
export function verifyTranslation(source: string, candidate: string): Rejection | null {
  const text = candidate.trim()
  if (text.length === 0) return { reason: 'empty' }

  const sourceTokens = new Set(numericTokens(source))
  for (const token of numericTokens(text)) {
    // A number the source never contained is either a hallucination or a
    // mangled one. Either way it cannot be shown as official information.
    if (!sourceTokens.has(token)) {
      return { reason: 'invented-number', detail: token }
    }
  }

  const ratio = text.length / Math.max(1, source.trim().length)
  if (ratio < MIN_RATIO || ratio > MAX_RATIO) {
    return { reason: 'implausible-length', detail: ratio.toFixed(2) }
  }

  return null
}

/** Pulls the text out of an Anthropic response, or says why it could not. */
export function readModelResponse(payload: unknown): TranslationOutcome {
  if (!payload || typeof payload !== 'object') {
    return { status: 'unavailable', reason: 'malformed-response' }
  }

  // The API says outright when it ran out of budget. That is a definitive
  // signal and it must be checked before the content is read.
  //
  // The length guard below cannot substitute for it: a truncated Hindi or
  // Arabic translation is still plausibly longer than its English source,
  // so it scores inside the accepted ratio and is shown to the reader. A
  // 1500-character warning was observed ending mid-word this way.
  if ((payload as { stop_reason?: unknown }).stop_reason === 'max_tokens') {
    return { status: 'unavailable', reason: 'truncated' }
  }

  const content = (payload as { content?: unknown }).content
  if (!Array.isArray(content)) {
    return { status: 'unavailable', reason: 'malformed-response' }
  }

  const block = content.find(
    (b): b is { type: string; text: string } =>
      !!b && typeof b === 'object' &&
      (b as { type?: unknown }).type === 'text' &&
      typeof (b as { text?: unknown }).text === 'string',
  )

  if (!block) return { status: 'unavailable', reason: 'malformed-response' }

  const text = block.text.trim()
  if (text.length === 0) return { status: 'unavailable', reason: 'empty-response' }

  return { status: 'translated', text }
}

/**
 * The full decision: read the response, then verify it before accepting.
 */
export function acceptTranslation(source: string, payload: unknown): TranslationOutcome {
  const parsed = readModelResponse(payload)
  if (parsed.status === 'unavailable') return parsed

  const rejection = verifyTranslation(source, parsed.text)
  if (rejection) return { status: 'unavailable', reason: 'rejected-unsafe' }

  return parsed
}

/**
 * The instruction given to the model.
 *
 * Every rule here exists because breaking it would change what the official
 * message says.
 */
export const SYSTEM_PROMPT = `You translate official Australian bushfire warnings for people with low English confidence.

Rules you must not break:
- Translate and simplify ONLY the text you are given.
- Never add advice, instructions, warnings, or facts that are not in the source text.
- Never remove a safety instruction that is in the source text.
- Never change a place name, a street, a suburb, a distance, a size, a time, or a phone number. Copy every number exactly as it appears.
- Never soften or strengthen the urgency of the source text.
- Never translate an official alert level name. Leave it exactly as written.
- Use short sentences and everyday words. Aim for a reading age of about 10.
- Reply with the translated text only. No preamble, no notes, no quotes.
- If you cannot translate the text faithfully, reply with the original text unchanged.`
