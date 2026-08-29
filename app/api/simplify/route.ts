import { NextResponse } from 'next/server'

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

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  // No key is a supported configuration, not an error.
  if (!apiKey) return NextResponse.json({ text: null })

  let body: { text?: unknown; language?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ text: null })
  }

  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const language = typeof body.language === 'string' ? body.language : 'en'
  const languageName = LANGUAGE_NAME[language]

  if (!text || !languageName) return NextResponse.json({ text: null })

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 600,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Translate into ${languageName}:\n\n${text}`,
          },
        ],
      }),
    })

    if (!response.ok) throw new Error(`Anthropic responded ${response.status}`)

    const data = (await response.json()) as { content?: { type: string; text?: string }[] }
    const simplified = data.content?.find((block) => block.type === 'text')?.text?.trim()

    return NextResponse.json({ text: simplified || null })
  } catch {
    // The phrase-pack rendering is already on screen. Degrade silently.
    return NextResponse.json({ text: null })
  }
}
