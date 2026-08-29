import { SpeechEngine, type SynthLike, type UtteranceLike } from './engine'

export { splitForSpeech, pickVoice, RATE } from './engine'
export type { SpeechState, SpeechStatus } from './engine'

export type SpeechSupport =
  /** The browser has no speech synthesis at all. */
  | 'unsupported'
  /** Supported, but no voice exists for the requested language. */
  | 'no-voice'
  | 'ready'

function synthesis(): SpeechSynthesis | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null
  return window.speechSynthesis
}

/**
 * Chrome populates the voice list asynchronously, so the first getVoices()
 * call returns an empty array. Waits for voiceschanged, with a timeout so a
 * browser that never fires it cannot hang the caller.
 */
export function getVoicesAsync(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  const synth = synthesis()
  if (!synth) return Promise.resolve([])

  const immediate = synth.getVoices()
  if (immediate.length > 0) return Promise.resolve(immediate)

  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      synth.removeEventListener('voiceschanged', finish)
      resolve(synth.getVoices())
    }
    synth.addEventListener('voiceschanged', finish)
    setTimeout(finish, timeoutMs)
  })
}

export async function checkSupport(locale: string): Promise<SpeechSupport> {
  const synth = synthesis()
  if (!synth) return 'unsupported'
  const voices = await getVoicesAsync()
  const base = locale.split('-')[0].toLowerCase()
  const match = voices.some((v) => v.lang.replace('_', '-').toLowerCase().startsWith(base))
  return match ? 'ready' : 'no-voice'
}

/**
 * One engine for the whole page.
 *
 * There is a single synthesiser in the browser, so there must be a single
 * owner of it. Two components each calling speak() would cancel each other,
 * which is what the previous build did when auto-play and the button ran at
 * the same time.
 */
let engine: SpeechEngine | null = null

export function getSpeechEngine(): SpeechEngine | null {
  const synth = synthesis()
  if (!synth) return null
  if (engine) return engine

  const adapter: SynthLike = {
    speak: (u) => synth.speak(u as unknown as SpeechSynthesisUtterance),
    cancel: () => synth.cancel(),
    pause: () => synth.pause(),
    resume: () => synth.resume(),
    getVoices: () => synth.getVoices(),
  }

  engine = new SpeechEngine(
    adapter,
    (text) => new SpeechSynthesisUtterance(text) as unknown as UtteranceLike,
  )
  return engine
}

export function __resetEngineForTests(): void {
  engine = null
}

export function stopSpeaking(): void {
  getSpeechEngine()?.stop()
}

/** Convenience for callers that only want to start playback. */
export function speak(text: string, locale: string): void {
  getSpeechEngine()?.speak(text, locale)
}
