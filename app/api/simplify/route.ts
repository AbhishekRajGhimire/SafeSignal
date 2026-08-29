import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

const LANGUAGE_NAME: Record<string, string> = {
  en: 'English',
  zh: 'Simplified Chinese',
  hi: 'Hindi',
  vi: 'Vietnamese',
}

const SYSTEM_PROMPT = `You translate official Australian bushfire warnings for people with low English confidence.

Rules you must not break:
- Translate and simplify ONLY the text you are given.
- Never add advice, instructions, or facts that are not in the source text.
- Never remove a safety instruction that is in the source text.
- Use short sentences and everyday words. Aim for a reading age of about 10.
- Reply with the translated text only. No preamble, no notes, no quotes.`

/** Overridable so the model can be changed without a code edit. */
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-opus-5'

export interface SimplifyResponse {
  text: string | null
  /**
   * Why no text came back. Safe to expose: it never contains the key, the
   * prompt, or upstream error text. Without this the route was a black box,
   * because every failure looked identical to "no key configured".
   */
  reason?: 'no-key' | 'bad-request' | 'upstream-error' | 'empty-response'
  status?: number
}

function noText(body: Omit<SimplifyResponse, 'text'>) {
  return NextResponse.json<SimplifyResponse>({ text: null, ...body })
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  // No key is a supported configuration, not an error.
  if (!apiKey) return noText({ reason: 'no-key' })

  let body: { text?: unknown; language?: unknown }
  try {
    body = await request.json()
  } catch {
    return noText({ reason: 'bad-request' })
  }

  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const language = typeof body.language === 'string' ? body.language : 'en'
  const languageName = LANGUAGE_NAME[language]

  if (!text || !languageName) return noText({ reason: 'bad-request' })

  const client = new Anthropic({ apiKey })

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      // Deliberately not 'low'. At low effort this produced a garbled opening
      // clause in Hindi roughly one run in four. The text is short, so the
      // cost difference is negligible, and a mangled word in an evacuation
      // instruction is not an acceptable trade for it.
      output_config: { effort: 'high' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Translate into ${languageName}:\n\n${text}` }],
    })

    // The model can decline; that is a 200 response, not a thrown error.
    if (message.stop_reason === 'refusal') {
      return noText({ reason: 'upstream-error' })
    }

    const simplified = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim()

    if (!simplified) return noText({ reason: 'empty-response' })

    return NextResponse.json<SimplifyResponse>({ text: simplified })
  } catch (error) {
    // Logged for the server operator; the user still sees a working screen
    // because the phrase-pack rendering is already on it.
    if (error instanceof Anthropic.APIError) {
      console.error(`[simplify] Anthropic ${error.status}: ${error.message}`)
      return noText({ reason: 'upstream-error', status: error.status })
    }
    console.error('[simplify] unexpected failure', error)
    return noText({ reason: 'upstream-error' })
  }
}
